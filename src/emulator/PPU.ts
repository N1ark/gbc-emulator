import {
    ConsoleType,
    IFLAG_LCDC,
    IFLAG_VBLANK,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
} from "./constants";
import { CircularRAM, Addressable, RAM } from "./Memory";
import { PaddedSubRegister, Register00, RegisterFF, SubRegister } from "./Register";
import System from "./System";
import { asSignedInt8, Int2, Int3, wrap8 } from "./util";
import GameBoyOutput from "./GameBoyOutput";
import OAM, { Sprite } from "./OAM";

type KeyForType<T, V> = NonNullable<
    {
        [k in keyof T]: T[k] extends V ? k : never;
    }[keyof T]
>;

type PPUMode = {
    doTick: KeyForType<PPU, (system: System) => void>;
    flag: number;
    cycles: number;
};

type PPUModeI = PPUMode & { interrupt: number };

type TileCache = Record<number, { valid: boolean; data: Int2[][] }>;

/*
 * All modes, with:
 * - flag: corresponding STAT flag
 * - cycles: cycles until completion (including previous steps)
 * - interrupt?: optional corresponding STAT interrupt flag
 */
const MODE_HBLANK_FIRST: PPUModeI = {
    doTick: "tickHBlankFirst",
    flag: 0b00,
    cycles: 18,
    interrupt: 1 << 3,
};
const MODE_HBLANK: PPUModeI = {
    doTick: "tickHBlank",
    flag: 0b00,
    cycles: 51,
    interrupt: 1 << 3,
};
const MODE_VBLANK: PPUModeI = {
    doTick: "tickVBlank",
    flag: 0b01,
    cycles: 114,
    interrupt: 1 << 4,
};
const MODE_SEARCHING_OAM: PPUModeI = {
    doTick: "tickSearchingOam",
    flag: 0b10,
    cycles: 20,
    interrupt: 1 << 5,
};
const MODE_TRANSFERRING: PPUMode = {
    doTick: "tickTransferring",
    flag: 0b11,
    cycles: 43,
};

// Helpful constants
const SCREEN_HEIGHT_WOFFSCREEN = 154;

// LCD control flags
const LCDC_BG_WIN_PRIO = 1 << 0;
const LCDC_OBJ_ENABLE = 1 << 1;
const LCDC_OBJ_SIZE = 1 << 2;
const LCDC_BG_TILE_MAP_AREA = 1 << 3;
/** @link https://gbdev.io/pandocs/LCDC.html#lcdc4--bg-and-window-tile-data-area */
const LCDC_BG_WIN_TILE_DATA_AREA = 1 << 4;
const LCDC_WIN_ENABLE = 1 << 5;
const LCDC_WIN_TILE_MAP_AREA = 1 << 6;
const LCDC_LCD_ENABLE = 1 << 7;

// LCD status flags
const STAT_MODE = 0b11;
const STAT_LYC_LY_EQ_FLAG = 1 << 2;
const STAT_LYC_LY_EQ_INT = 1 << 6;

// Palette flags
type ColorPalette = Record<Int2, number>;
const PALETTE_AUTO_INCREMENT = 1 << 7;
const PALETTE_INDEX = 0b0011_1111;

// VRAM2 Attributes
const VBK_BANK_ID = 1 << 0;
const VRAM2_ATTR_BG_OAM_PRIORITY = 1 << 7;
const VRAM2_ATTR_V_FLIP = 1 << 6;
const VRAM2_ATTR_H_FLIP = 1 << 5;
const VRAM2_ATTR_VRAM_BANK = 1 << 3;
const VRAM2_ATTR_PALETTE = 0b111;

abstract class ColorControl implements Addressable {
    protected abstract readonly addresses: Record<number, Addressable>;
    abstract getBgPalette(id: Int3): ColorPalette;
    abstract getObjPalette(sprite: Sprite): ColorPalette;

    read(pos: number): number {
        const component = this.addresses[pos];
        if (!component) return 0xff;
        return component.read(pos);
    }

    write(pos: number, value: number): void {
        const component = this.addresses[pos];
        if (!component) return;
        component.write(pos, value);
    }
}

class DMGColorControl extends ColorControl {
    static readonly colorOptions: Record<Int2, number> = {
        0b00: 0xffffffff, // white
        0b01: 0xffaaaaaa, // light gray
        0b10: 0xff555555, // dark gray
        0b11: 0xff000000, // black
    };

    // Background palette
    protected bgPalette = new SubRegister(0x00);
    // Object palettes
    protected objPalette0 = new SubRegister(0x00);
    protected objPalette1 = new SubRegister(0x00);

    protected addresses = {
        0xff47: this.bgPalette,
        0xff48: this.objPalette0,
        0xff49: this.objPalette1,
    };

    getBgPalette(): ColorPalette {
        const palette = this.bgPalette.get();
        return {
            0b00: DMGColorControl.colorOptions[((palette >> 0) & 0b11) as Int2],
            0b01: DMGColorControl.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: DMGColorControl.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: DMGColorControl.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        const palette =
            sprite.dmgPaletteNumber === 0 ? this.objPalette0.get() : this.objPalette1.get();
        return {
            0b00: 0x00000000, // unused, color 0b00 is transparent
            0b01: DMGColorControl.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: DMGColorControl.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: DMGColorControl.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }
}

class CGBColorControl extends ColorControl {
    // Background palette
    protected bgPaletteOptions = new PaddedSubRegister(0b0100_0000);
    protected bgPaletteData = new RAM(64);
    // Object palettes
    protected objPaletteOptions = new PaddedSubRegister(0b0100_0000);
    protected objPaletteData = new RAM(64);

    protected addresses = {
        0xff68: this.bgPaletteOptions,
        0xff69: this.bgPaletteData,
        0xff6a: this.objPaletteOptions,
        0xff6b: this.objPaletteData,
    };

    override read(pos: number): number {
        if (pos === 0xff69)
            return this.bgPaletteData.read(this.bgPaletteOptions.get() & PALETTE_INDEX);

        if (pos === 0xff6b)
            return this.objPaletteData.read(this.objPaletteOptions.get() & PALETTE_INDEX);

        return super.read(pos);
    }

    override write(pos: number, value: number): void {
        if (pos === 0xff69) {
            const bgPaletteOptions = this.bgPaletteOptions.get();
            const index = bgPaletteOptions & PALETTE_INDEX;
            this.bgPaletteData.write(index, value);
            if (bgPaletteOptions & PALETTE_AUTO_INCREMENT)
                this.bgPaletteOptions.set(
                    (bgPaletteOptions & ~PALETTE_INDEX) | ((index + 1) & PALETTE_INDEX)
                );
        } else if (pos === 0xff6b) {
            const objPaletteOptions = this.objPaletteOptions.get();
            const index = objPaletteOptions & PALETTE_INDEX;
            this.objPaletteData.write(index, value);
            if (objPaletteOptions & PALETTE_AUTO_INCREMENT)
                this.objPaletteOptions.set(
                    (objPaletteOptions & ~PALETTE_INDEX) | ((index + 1) & PALETTE_INDEX)
                );
        } else {
            super.write(pos, value);
        }
    }

    protected decodePalette(data: RAM, id: number, offset: number) {
        const palette: ColorPalette = new Uint32Array(4) as any as ColorPalette;
        for (let colorIdx = offset; colorIdx < 4; colorIdx++) {
            const colorLow = data.read(id * 8 + colorIdx * 2);
            const colorHigh = data.read(id * 8 + colorIdx * 2 + 1);
            const fullColor = (colorHigh << 8) | colorLow;

            const red5 = (fullColor >> 0) & 0b0001_1111;
            const green5 = (fullColor >> 5) & 0b0001_1111;
            const blue5 = (fullColor >> 10) & 0b0001_1111;

            const red8 = (red5 << 3) | (red5 >> 2);
            const green8 = (green5 << 3) | (green5 >> 2);
            const blue8 = (blue5 << 3) | (blue5 >> 2);

            palette[colorIdx as Int2] = (0xff << 24) | (blue8 << 16) | (green8 << 8) | red8;
        }
        return palette;
    }

    getBgPalette(id: Int3): ColorPalette {
        return this.decodePalette(this.bgPaletteData, id, 0);
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        return this.decodePalette(this.objPaletteData, sprite.cgbPaletteNumber, 1);
    }
}

abstract class VRAMController implements Addressable {
    protected abstract readonly addresses: Record<number, Addressable>;
    protected abstract get currentBank(): Addressable;
    protected abstract get currentCache(): TileCache;

    protected static makeCache(): TileCache {
        return [...new Array(0x180)].map(() => ({
            valid: false,
            data: Array.from(Array(8), () => new Array(8)),
        }));
    }

    protected _getTile(tileAddress: number, bank: Addressable, cache: TileCache): Int2[][] {
        const cachedTile = cache[(tileAddress >> 4) & 0x1ff];
        if (!cachedTile.valid) {
            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                const tileDataH = bank.read(tileAddress + tileY * 2);
                const tileDataL = bank.read(tileAddress + tileY * 2 + 1);
                for (let tileX = 0; tileX < 8; tileX++) {
                    const shadeL = (tileDataH >> (7 - tileX)) & 0b1;
                    const shadeH = (tileDataL >> (7 - tileX)) & 0b1;
                    const shade = ((shadeH << 1) | shadeL) as Int2;
                    cachedTile.data[tileX][tileY] = shade;
                }
            }
            cachedTile.valid = true;
        }
        return cachedTile.data;
    }

    abstract getTile(tileAddress: number, bankId: 0 | 1): Int2[][];

    abstract readBank0(pos: number): number;
    abstract readBank1(pos: number): number;

    read(pos: number): number {
        if (0x8000 <= pos && pos <= 0x9fff) return this.currentBank.read(pos);
        const component = this.addresses[pos];
        if (component) return component.read(pos);
        return 0xff;
    }

    write(address: number, value: number): void {
        if (0x8000 <= address && address <= 0x9fff) {
            if (
                // if in tile memory, dirty tile
                0x8000 <= address &&
                address < 0x9800 &&
                value !== this.currentBank.read(address)
            ) {
                this.currentCache[(address >> 4) & 0x1ff].valid = false;
            }
            return this.currentBank.write(address, value);
        }
        const component = this.addresses[address];
        if (component) return component.write(address, value);
    }
}

class DMGVRAMController extends VRAMController {
    protected vram = new CircularRAM(8192, 0x8000);
    protected tileCache = VRAMController.makeCache();
    protected currentBank = this.vram;
    protected currentCache = this.tileCache;
    protected readonly addresses: Record<number, Addressable> = {};

    readBank0(pos: number): number {
        return this.vram.read(pos);
    }
    readBank1(pos: number): number {
        return 0;
    }

    getTile(tileAddress: number): Int2[][] {
        return this._getTile(tileAddress, this.vram, this.tileCache);
    }
}

class CGBVRAMController extends VRAMController {
    protected vram0 = new CircularRAM(8192, 0x8000);
    protected vram1 = new CircularRAM(8192, 0x8000);
    protected tileCache0 = VRAMController.makeCache();
    protected tileCache1 = VRAMController.makeCache();
    protected vramBank = new PaddedSubRegister(0b1111_1110);

    protected get currentBank() {
        return this.vramBank.get() & 0b1 ? this.vram1 : this.vram0;
    }
    protected get currentCache() {
        return this.vramBank.get() & 0b1 ? this.tileCache1 : this.tileCache0;
    }

    protected readonly addresses: Record<number, Addressable> = {
        0xff4f: this.vramBank,
    };

    readBank0(pos: number): number {
        return this.vram0.read(pos);
    }

    readBank1(pos: number): number {
        return this.vram1.read(pos);
    }

    getTile(tileAddress: number, bank: 0 | 1): Int2[][] {
        return this._getTile(
            tileAddress,
            bank ? this.vram1 : this.vram0,
            bank ? this.tileCache1 : this.tileCache0
        );
    }
}

/**
 * The PPU of the GBC, responsible for rendering the current state of the console.
 * @link https://gbdev.io/pandocs/Rendering.html
 */
class PPU implements Addressable {
    // Internal counter for cycles
    cycleCounter: number = 0;
    windowLineCounter: number = 0;
    mode: PPUMode = MODE_VBLANK;

    interruptStateBefore: boolean = false;
    interruptLineState = {
        lycLyMatch: false,
        oamActive: false,
        vblankActive: false,
        hblankActive: false,
    };
    nextInterruptLineUpdate: Partial<typeof this.interruptLineState> | null = null;

    // OAM
    oam = new OAM();
    canReadOam: boolean = true;
    canWriteOam: boolean = true;

    // Variable extra cycles during pixel transfer
    transferExtraCycles: number = 0;

    // Read sprites
    readSprites: Sprite[] = [];

    // Data Store
    vramControl: VRAMController;
    canReadVram: boolean = true;
    canWriteVram: boolean = true;

    // Temporary buffer when drawing line by line
    videoBuffer = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH).fill(0xffffffff);
    // Complete buffer with the last fully drawn frame
    lastVideoOut = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH);
    // Debug video output/storage
    backgroundVideoBuffer?: Uint32Array;
    tilesetVideoBuffer?: Uint32Array;

    // General use
    /** @link https://gbdev.io/pandocs/LCDC.html */
    lcdControl = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/STAT.html */
    lcdStatus = new PaddedSubRegister(0b1000_0000, 0x85);
    /** Only for GBC @link https://gbdev.io/pandocs/CGB_Registers.html#ff6c--opri-cgb-mode-only-object-priority-mode */
    objPriorityMode: Addressable;

    // Positioning
    screenY = new SubRegister(0x00); // these two indicate position of the viewport
    screenX = new SubRegister(0x00); // in the background map

    lcdY = new SubRegister(0x00); // indicates currently drawn horizontal line
    lcdYCompare = new SubRegister(0x00);

    windowY = new SubRegister(0x00); // position of the window
    windowX = new SubRegister(0x00);

    // Color control
    colorControl: ColorControl;

    // General use
    consoleMode: ConsoleType;
    protected registerAddresses: Record<number, Addressable>;

    constructor(mode: ConsoleType) {
        if (mode === "CGB") {
            this.vramControl = new CGBVRAMController();
            this.colorControl = new CGBColorControl();
            this.objPriorityMode = new PaddedSubRegister(0b1111_1110);
        } else {
            this.vramControl = new DMGVRAMController();
            this.colorControl = new DMGColorControl();
            this.objPriorityMode = RegisterFF;
        }

        this.consoleMode = mode;
        this.registerAddresses = {
            0xff40: this.lcdControl,
            0xff41: this.lcdStatus,
            0xff42: this.screenY,
            0xff43: this.screenX,
            0xff44: this.lcdY,
            0xff45: this.lcdYCompare,
            0xff46: this.oam,
            0xff47: this.colorControl,
            0xff48: this.colorControl,
            0xff49: this.colorControl,
            0xff4a: this.windowY,
            0xff4b: this.windowX,
            0xff4f: this.vramControl,
            0xff68: this.colorControl,
            0xff69: this.colorControl,
            0xff6a: this.colorControl,
            0xff6b: this.colorControl,
            0xff6c: this.objPriorityMode,
        };
    }

    /**
     * This the PPU, effectively updating the screen-buffer and rendering it if it's done.
     * @link https://gbdev.io/pandocs/pixel_fifo.html
     */
    tick(system: System) {
        this.oam.tick(system);

        if (!this.lcdControl.flag(LCDC_LCD_ENABLE)) return;

        // Update interrupt line from previous write operations?
        if (this.nextInterruptLineUpdate !== null) {
            this.updateInterrupt(system, this.nextInterruptLineUpdate);
            this.nextInterruptLineUpdate = null;
        }

        this.cycleCounter++;

        if (this.cycleCounter === 1) {
            this.setMode(this.mode);
        }

        this[this.mode.doTick](system);
    }

    tickHBlankFirst(system: System) {
        if (this.cycleCounter === MODE_HBLANK_FIRST.cycles) {
            this.cycleCounter = 0;
            this.mode = MODE_TRANSFERRING;
        }
    }

    tickHBlank(system: System) {
        if (this.cycleCounter === 1) {
            this.updateInterrupt(system, { hblankActive: true });

            this.canReadOam = true;

            // For LY <= 1 there is a delay of one extra cycle
            if (this.lcdY.get() > 1) {
                this.canReadVram = true;
            }
        }

        if (this.cycleCounter === 2) {
            this.canReadVram = true;
            this.canWriteOam = true;
            this.canWriteVram = true;
        }

        if (this.cycleCounter === MODE_HBLANK.cycles - this.transferExtraCycles) {
            this.cycleCounter = 0;
            this.lcdY.set(wrap8(this.lcdY.get() + 1));

            if (this.lcdY.get() !== this.lcdYCompare.get()) {
                this.updateInterrupt(system, { lycLyMatch: false });
            }

            if (this.lcdY.get() === SCREEN_HEIGHT) {
                this.mode = MODE_VBLANK;
            } else {
                this.mode = MODE_SEARCHING_OAM;
            }
        }
    }

    tickVBlank(system: System) {
        if (this.cycleCounter === 1) {
            const isVblankStart = this.lcdY.get() === 144;
            this.updateInterrupt(system, {
                lycLyMatch: this.lcdY.get() === this.lcdYCompare.get(),
                vblankActive: isVblankStart || this.interruptLineState.vblankActive,
                oamActive: isVblankStart || this.interruptLineState.oamActive,
            });

            if (this.lcdY.get() === 144) {
                system.requestInterrupt(IFLAG_VBLANK);
                this.lastVideoOut.set(this.videoBuffer);
            }
        } else if (this.cycleCounter === 20) {
            this.updateInterrupt(system, { oamActive: false });
        } else if (this.cycleCounter === MODE_VBLANK.cycles) {
            this.cycleCounter = 0;
            this.lcdY.set(wrap8(this.lcdY.get() + 1));
            if (this.lcdY.get() === SCREEN_HEIGHT_WOFFSCREEN) {
                this.lcdY.set(0);
                this.windowLineCounter = 0;
                this.mode = MODE_SEARCHING_OAM;
            }
        }
    }

    tickSearchingOam(system: System) {
        if (this.cycleCounter === 1) {
            this.updateInterrupt(system, {
                oamActive: true,
                hblankActive: false,
                vblankActive: false,
                lycLyMatch: this.lcdY.get() === this.lcdYCompare.get(),
            });
            this.canReadOam = false;
        }

        if (this.cycleCounter === 2) {
            this.canWriteOam = false;
        }

        if (this.cycleCounter === MODE_SEARCHING_OAM.cycles) {
            this.cycleCounter = 0;
            this.mode = MODE_TRANSFERRING;

            // Read the sprite data here ! this should create a copy !!
            const y = this.lcdY.get();
            // Height of objects in pixels
            const objHeight = this.lcdControl.flag(LCDC_OBJ_SIZE) ? 16 : 8;
            // This is only relevant in GBC: priority by position or by index
            const objPriorityMode = this.objPriorityMode.read(0) & 1 ? "coordinate" : "index";
            // We select the sprites the following way:
            // - must be visible
            // - max 10 per line
            // - sorted, first by X position then by index
            this.readSprites = this.oam
                .getSprites()
                .filter(
                    // only get selected sprites
                    (sprite) => sprite.y <= y && y < sprite.y + objHeight
                )
                .slice(0, 10) // only 10 sprites per scanline, lower index first
                .map((sprite, index) => [sprite, index] as [Sprite, number])
                // sort by x then index
                .sort(
                    ([spriteA, indexA], [spriteB, indexB]) =>
                        objPriorityMode === "coordinate"
                            ? spriteA.x === spriteB.x // first by coordinate then by index
                                ? indexA - indexB
                                : spriteA.x - spriteB.x
                            : indexA - indexB // only by index
                )
                .map(([sprite]) => sprite);
        }
    }

    tickTransferring(system: System) {
        if (this.cycleCounter === 1) {
            this.updateInterrupt(null, { oamActive: false });

            this.canReadOam = false;
            this.canReadVram = false;

            this.transferExtraCycles = 0;

            // Extra cycles are spent during transfer depending on scroll, because the tile is
            // still loaded (the pixels are simply thrown away)
            const offsetX = this.screenX.get() % 8;
            this.transferExtraCycles += Math.ceil(offsetX / 4);

            // When drawing sprites we delay extra 6 cycles per sprite.
            // We may also delay longer if the sprite if towards the left of the screen, because
            // the PPU must wait for those pixels to be drawn from the background before
            // taking care of the sprites. This delay can thus add up to 5 cycles per
            // X-position.
            // https://gbdev.io/pandocs/STAT.html#properties-of-stat-modes
            if (this.lcdControl.flag(LCDC_OBJ_ENABLE)) {
                let extraSpriteTCycles = 0;
                let lastPenaltyX = NaN;
                let lastPenaltyPaid = false;
                for (let sprite of this.readSprites) {
                    if (lastPenaltyX !== sprite.x || !lastPenaltyPaid) {
                        lastPenaltyX = sprite.x;
                        lastPenaltyPaid = true;
                        extraSpriteTCycles +=
                            5 - Math.min(5, (sprite.x + this.screenX.get()) % 8);
                    }
                    extraSpriteTCycles += 6;
                }
                // Re-convert to M-cycles
                this.transferExtraCycles += Math.floor(extraSpriteTCycles / 4);
            }

            this.updateScanline(system);
        }

        if (this.cycleCounter === 2) {
            this.canWriteOam = false;
            this.canWriteVram = false;
        }

        if (this.cycleCounter === MODE_TRANSFERRING.cycles + this.transferExtraCycles) {
            this.cycleCounter = 0;
            this.mode = MODE_HBLANK;
        }
    }

    pushOutput(output: GameBoyOutput) {
        if (output.receive) {
            output.receive(this.lastVideoOut);
        }
        if (output.debugBackground) {
            const backgroundImg = this.debugBackground();
            output.debugBackground(backgroundImg);
        }
        if (output.debugTileset) {
            const tilesetImg = this.debugTileset();
            output.debugTileset(tilesetImg);
        }
    }

    /** Sets the current mode of the PPU, updating the STAT register. */
    setMode(mode: PPUMode) {
        this.lcdStatus.set((this.lcdStatus.get() & ~STAT_MODE) | mode.flag);
    }

    /**
     * Will update the STAT interrupt line, raise an interrupt if there is a high to low
     * transition and the passed in System isn't null (ie. pass null to disable interrupts).
     */
    updateInterrupt(system: System | null, data: Partial<typeof this.interruptLineState>) {
        Object.assign(this.interruptLineState, data);
        const interruptState =
            (this.lcdStatus.flag(STAT_LYC_LY_EQ_INT) && this.interruptLineState.lycLyMatch) ||
            (this.lcdStatus.flag(MODE_HBLANK.interrupt) &&
                this.interruptLineState.hblankActive) ||
            (this.lcdStatus.flag(MODE_VBLANK.interrupt) &&
                this.interruptLineState.vblankActive) ||
            (this.lcdStatus.flag(MODE_SEARCHING_OAM.interrupt) &&
                this.interruptLineState.oamActive);

        this.lcdStatus.sflag(STAT_LYC_LY_EQ_FLAG, this.interruptLineState.lycLyMatch);

        // LCDC Interrupt only happens on rising edges (if allowed)
        if (system && interruptState && !this.interruptStateBefore) {
            system.requestInterrupt(IFLAG_LCDC);
        }
        this.interruptStateBefore = interruptState;
    }

    /** Updates the current scanline, by rendering the background, window and then objects. */
    updateScanline(system: System) {
        const bgPriorities = [...new Array(SCREEN_WIDTH)].fill(false);
        // The BG/WIN priority flag acts as a toggle only in DMG
        if (this.consoleMode === "CGB" || this.lcdControl.flag(LCDC_BG_WIN_PRIO)) {
            this.drawBackground(bgPriorities);

            if (this.lcdControl.flag(LCDC_WIN_ENABLE)) {
                this.drawWindow(bgPriorities);
            }
        } else {
            this.fillWhite();
        }

        if (this.lcdControl.flag(LCDC_OBJ_ENABLE)) {
            this.drawObjects(bgPriorities);
        }
    }

    /** Function to get access to the tile data, ie. the shades of a tile */
    getTileAddress(n: number): number {
        return this.lcdControl.flag(LCDC_BG_WIN_TILE_DATA_AREA)
            ? // Unsigned regular, 0x8000-0x8fff
              0x8000 + n * 16
            : // Signed offset, 0x9000-0x97ff for 0-127 and 0x8800-0x8fff for 128-255
              0x9000 + asSignedInt8(n) * 16;
    }

    debugBackground() {
        const width = 256;
        const height = 256;
        if (this.backgroundVideoBuffer === undefined)
            this.backgroundVideoBuffer = new Uint32Array(width * height);

        // The tilemap used (a map of tile *pointers*)
        const tileMapLoc = this.lcdControl.flag(LCDC_BG_TILE_MAP_AREA) ? 0x9c00 : 0x9800;

        for (let i = 0; i < 1024; i++) {
            // Tile positions (0 <= n < 32)
            const posX = i % 32; // 32 tiles on width
            const posY = Math.floor(i / 32); // 32 tiles on height

            const tileIndex = tileMapLoc + i;

            // On CGB, the attributes of the tile
            // Note we can do this even in DMG mode, because VRAM2 in DMG is just a 00 register,
            // and all the 0 attributes match the normal behaviour of the DMG
            const tileAttributes = this.vramControl.readBank1(tileIndex);
            const flipX = (tileAttributes & VRAM2_ATTR_H_FLIP) !== 0;
            const flipY = (tileAttributes & VRAM2_ATTR_V_FLIP) !== 0;
            const vramBank = (tileAttributes & VRAM2_ATTR_VRAM_BANK) !== 0 ? 1 : 0;
            const tilePalette = (tileAttributes & VRAM2_ATTR_PALETTE) as Int3;

            // Map of colors for each shade
            const palette = this.colorControl.getBgPalette(tilePalette);

            // The ID (pointer) of the tile
            const tileAddress = this.vramControl.readBank0(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = this.getTileAddress(tileAddress);
            // Get the tile data
            const tileData = this.vramControl.getTile(tileDataAddress, vramBank);

            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                for (let tileX = 0; tileX < 8; tileX++) {
                    const colorId = tileData[tileX][tileY];
                    const index = posX * 8 + posY * width * 8 + tileX + tileY * width;
                    this.backgroundVideoBuffer[index] = palette[colorId];
                }
            }
        }

        return this.backgroundVideoBuffer;
    }

    debugTileset() {
        const width = 128; // 16 * 8;
        const height = 192; // 24 * 8;
        if (this.tilesetVideoBuffer === undefined)
            this.tilesetVideoBuffer = new Uint32Array(width * height);

        // The colors used
        const palette = {
            0b00: 0xffffffff,
            0b01: 0xffaaaaaa,
            0b10: 0xff555555,
            0b11: 0xff000000,
        };

        for (let i = 0; i < 0x180; i++) {
            const tileAddress = 0x8000 + i * 16;
            // Tile positions (0 <= n < 32)
            const posX = i % 16; // 20 tiles on width
            const posY = Math.floor(i / 16);
            // Get tile data
            const tileData = this.vramControl.getTile(tileAddress, 0);
            // Draw the 8 lines of the tile
            for (let tileX = 0; tileX < 8; tileX++) {
                for (let tileY = 0; tileY < 8; tileY++) {
                    const colorId = tileData[tileX][tileY];
                    const index = posX * 8 + posY * width * 8 + tileX + tileY * width;
                    this.tilesetVideoBuffer[index] = palette[colorId];
                }
            }
        }
        return this.tilesetVideoBuffer;
    }

    fillWhite() {
        const y = this.lcdY.get();
        const white = 0xffffffff;
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            this.videoBuffer[y * SCREEN_WIDTH + x] = white;
        }
    }

    drawBackground(priorities: boolean[]) {
        // The tilemap used (a map of tile *pointers*)
        const tileMapLoc = this.lcdControl.flag(LCDC_BG_TILE_MAP_AREA) ? 0x9c00 : 0x9800;

        // The top-left corner of the 160x144 view area
        const viewX = this.screenX.get();
        const viewY = this.screenY.get();

        // The currently read Y pixel of the bg map
        const y = wrap8(viewY + this.lcdY.get());
        // The currently read Y position of the corresponding tile (one tile is 8 pixels long)
        const tileY = Math.floor(y / 8);
        // The currently read Y position *inside* the tile
        const tileInnerY = y % 8;

        // Start of video buffer for this line
        const bufferStart = this.lcdY.get() * SCREEN_WIDTH;

        const scrollOffsetX = viewX % 8;

        for (let i = 0; i < SCREEN_WIDTH + scrollOffsetX; i += 8) {
            // The currently read X pixel of the bg map
            const x = wrap8(viewX + i);
            // The currently read X position of the corresponding tile
            // this determines the tile of the next 8 pixels
            const tileX = Math.floor(x / 8);

            // Index of the tile in the current tile data
            const tileIndex = tileMapLoc + tileX + tileY * 32;

            // On CGB, the attributes of the tile
            // Note we can do this even in DMG mode, because VRAM2 in DMG is just a 00 register,
            // and all the 0 attributes match the normal behaviour of the DMG
            const tileAttributes = this.vramControl.readBank1(tileIndex);
            const bgToOamPrio = (tileAttributes & VRAM2_ATTR_BG_OAM_PRIORITY) !== 0;
            const flipX = (tileAttributes & VRAM2_ATTR_H_FLIP) !== 0;
            const flipY = (tileAttributes & VRAM2_ATTR_V_FLIP) !== 0;
            const vramBank = (tileAttributes & VRAM2_ATTR_VRAM_BANK) !== 0 ? 1 : 0;
            const tilePalette = (tileAttributes & VRAM2_ATTR_PALETTE) as Int3;

            // Map of colors for each shade
            const palette = this.colorControl.getBgPalette(tilePalette);

            // The ID (pointer) of the tile
            const tileAddress = this.vramControl.readBank0(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = this.getTileAddress(tileAddress);
            // Get the tile data
            const tileData = this.vramControl.getTile(tileDataAddress, vramBank);

            for (let innerX = 0; innerX < 8; innerX++) {
                let posX = i + innerX - scrollOffsetX;
                if (posX < 0) continue;

                const arrayX = flipX ? 7 - innerX : innerX;
                const arrayY = flipY ? 7 - tileInnerY : tileInnerY;

                // Get the RGBA color, and draw it!
                const colorId = tileData[arrayX][arrayY];
                this.videoBuffer[bufferStart + posX] = palette[colorId];
                if ((this.consoleMode === "CGB" && bgToOamPrio) || colorId > 0) {
                    priorities[posX] = true;
                }
            }
        }
    }

    drawWindow(priorities: boolean[]) {
        // The top-left corner of the 160x144 view area
        const windowX = this.windowX.get() - 7;
        const windowY = this.windowY.get();

        if (this.lcdY.get() < windowY || windowX >= SCREEN_WIDTH) return;

        // The tilemap used (a map of tile *pointers*)
        const tileMapLoc = this.lcdControl.flag(LCDC_WIN_TILE_MAP_AREA) ? 0x9c00 : 0x9800;
        // The currently read Y pixel of the bg map
        const y = this.windowLineCounter++;
        // The currently read Y position of the corresponding tile (one tile is 8 pixels long)
        const tileY = Math.floor(y / 8);
        // The currently read Y position *inside* the tile
        const tileInnerY = y % 8;

        // Start of video buffer for this line
        const bufferStart = this.lcdY.get() * SCREEN_WIDTH;

        for (let i = windowX; i < SCREEN_WIDTH; i += 8) {
            // The currently read X pixel of the bg map
            const x = i - windowX;
            // The currently read X position of the corresponding tile
            // this determines the tile of the next 8 pixels
            const tileX = Math.floor(x / 8);

            // Index of the tile in the current tile data
            const tileIndex = tileMapLoc + tileX + tileY * 32;

            // On CGB, the attributes of the tile
            // Note we can do this even in DMG mode, because VRAM2 in DMG is just a 00 register,
            // and all the 0 attributes match the normal behaviour of the DMG
            const tileAttributes = this.vramControl.readBank1(tileIndex);
            const bgToOamPrio = (tileAttributes & VRAM2_ATTR_BG_OAM_PRIORITY) !== 0;
            const flipX = (tileAttributes & VRAM2_ATTR_H_FLIP) !== 0;
            const flipY = (tileAttributes & VRAM2_ATTR_V_FLIP) !== 0;
            const vramBank = (tileAttributes & VRAM2_ATTR_VRAM_BANK) !== 0 ? 1 : 0;
            const tilePalette = (tileAttributes & VRAM2_ATTR_PALETTE) as Int3;

            // Map of colors for each shade
            const palette = this.colorControl.getBgPalette(tilePalette);

            // The ID (pointer) of the tile
            const tileAddress = this.vramControl.readBank0(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = this.getTileAddress(tileAddress);
            // Get the tile data
            const tileData = this.vramControl.getTile(tileDataAddress, vramBank);

            for (let innerX = 0; innerX < 8; innerX++) {
                const posX = i + innerX;
                if (posX < 0) continue;

                // Get the RGBA color, and draw it!
                const arrayX = flipX ? 7 - innerX : innerX;
                const arrayY = flipY ? 7 - tileInnerY : tileInnerY;

                const colorId = tileData[arrayX][arrayY];
                this.videoBuffer[bufferStart + posX] = palette[colorId];
                if ((this.consoleMode === "CGB" && bgToOamPrio) || colorId > 0) {
                    priorities[posX] = true;
                }
            }
        }
    }

    drawObjects(priorities: boolean[]) {
        const y = this.lcdY.get();
        const doubleObjects = this.lcdControl.flag(LCDC_OBJ_SIZE);
        const sprites = this.readSprites;

        for (const sprite of sprites.reverse()) {
            // Get tile id (to get the actual data pointer)
            let tileId = sprite.tileIndex;
            if (doubleObjects) {
                // We ignore bit 0 for 8x16 objects
                tileId &= ~0b1;
                // if below tile and not flipped, or upper tile but flipped
                if (y - sprite.y >= 8 !== sprite.yFlip) tileId += 1;
            }
            // We need to check if we have double height sprites and this is the lower half of
            // the sprite, in which case the actual tile address is the next byte
            const tileAddress = 0x8000 + tileId * 16;
            // The currently read Y position inside the corresponding tile
            let tileY = (y - sprite.y) % 8;
            tileY = sprite.yFlip ? 7 - tileY : tileY;
            // Get the palette for the object
            const palette = this.colorControl.getObjPalette(sprite);

            // Get tile colors
            const tileData = this.vramControl.getTile(tileAddress, sprite.cgbVramBank);

            for (let innerX = 0; innerX < 8; innerX++) {
                const x = innerX + sprite.x;
                // The X value of the sprite is offset by 8 to the left, so we skip off-screen
                if (x < 0 || x >= SCREEN_WIDTH) continue;
                const tileX = sprite.xFlip ? 7 - innerX : innerX;
                const colorId = tileData[tileX][tileY];

                // if transparent, skip
                // also skip if bg/win should be above, and priority is set
                if (colorId === 0 || (sprite.bgAndWinOverObj && priorities[x])) continue;

                this.videoBuffer[y * SCREEN_WIDTH + x] = palette[colorId];
            }
        }
    }

    protected address(pos: number): Addressable {
        // VRAM
        if (0x8000 <= pos && pos <= 0x9fff) return this.vramControl;
        // OAM
        if (0xfe00 <= pos && pos <= 0xfe9f) return this.oam;
        // Registers
        const register = this.registerAddresses[pos];
        if (register) return register;

        throw new Error(`Invalid address given to PPU: ${pos.toString(16)}`);
    }

    read(address: number): number {
        const component = this.address(address);
        if (component === this.oam && !this.canReadOam) return 0xff;
        if (component === this.vramControl && !this.canReadVram) return 0xff;
        return component.read(address);
    }

    write(address: number, data: number): void {
        const component = this.address(address);

        if (component === this.oam && !this.canWriteOam) return;
        if (component === this.vramControl && !this.canWriteVram) return;

        if (component === this.lcdControl) {
            const isEnabled = this.lcdControl.flag(LCDC_LCD_ENABLE);
            const willEnable = (data & LCDC_LCD_ENABLE) === LCDC_LCD_ENABLE;

            // Will disable LCD
            if (isEnabled && !willEnable) {
                // console.warn("disabled LCD");
                this.lcdY.set(0);
                this.setMode(MODE_HBLANK_FIRST);
            }
            // Will enable LCD
            else if (!isEnabled && willEnable) {
                // console.warn("enabled LCD");
                this.lcdY.set(0);
                this.mode = MODE_HBLANK_FIRST;
                this.setMode(MODE_HBLANK_FIRST);
                this.cycleCounter = 0;

                this.nextInterruptLineUpdate = {
                    lycLyMatch: this.lcdY.get() === this.lcdYCompare.get(),
                    vblankActive: false,
                    hblankActive: false,
                    oamActive: false,
                };
            }
        }
        if (component === this.lcdStatus) {
            this.nextInterruptLineUpdate = {};
            // 3 first bits are read-only
            data = (data & 0b1111_1000) | (this.lcdStatus.get() & 0b0000_0111);
        }

        component.write(address, data);

        // Writing to LYC updates interrupt line if screen is on only
        if (component === this.lcdYCompare && this.lcdControl.flag(LCDC_LCD_ENABLE)) {
            this.nextInterruptLineUpdate = {
                lycLyMatch: this.lcdYCompare.get() === this.lcdY.get(),
            };
        }
    }
}

/**
 * To have nice TypeScript types we need to be able to refer to the protected attributes of the
 * PPU class. However this isn't possible. As such we instead create an exported class that
 * has all the public attributes of PPU, and choose to not export the PPU that has all its
 * fields as public.
 * This means other classes can keep using PPU as it was and don't have access to anything else,
 * but inside of the file everything is public and usable.
 */
class PPUExported implements Addressable {
    protected ppu: PPU;

    constructor(mode: ConsoleType) {
        this.ppu = new PPU(mode);
    }

    tick(system: System): void {
        this.ppu.tick(system);
    }

    pushOutput(output: GameBoyOutput): void {
        this.ppu.pushOutput(output);
    }

    read(pos: number): number {
        return this.ppu.read(pos);
    }

    write(pos: number, data: number): void {
        return this.ppu.write(pos, data);
    }
}

export default PPUExported;
