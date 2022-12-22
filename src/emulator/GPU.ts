import Addressable from "./Addressable";
import { IFLAG_LCDC, IFLAG_VBLANK, SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";
import { RAM } from "./Memory";
import { PaddedSubRegister, RegisterFF, SubRegister } from "./Register";
import System from "./System";
import { asSignedInt8, Int2, wrap8 } from "./util";
import GameBoyOutput from "./GameBoyOutput";
import OAM, { Sprite } from "./OAM";

type KeyForType<T, V> = NonNullable<
    {
        [k in keyof T]: T[k] extends V ? k : never;
    }[keyof T]
>;

type PPUMode = {
    doTick: KeyForType<GPU, (system: System) => void>;
    flag: number;
    cycles: number;
};

type PPUModeI = PPUMode & { interrupt: number };

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

/**
 * The GPU of the GBC, responsible for rendering the current state of the console.
 * @link https://gbdev.io/pandocs/Rendering.html
 */
class GPU implements Addressable {
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
    vram = new RAM(8192); // 8Kb memory
    canReadVram: boolean = true;
    canWriteVram: boolean = true;

    // Video output/storage
    output: GameBoyOutput;
    // Temporary buffer when drawing line by line
    videoBuffer = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH).fill(0xffffffff);
    // Complete buffer with the last fully drawn frame
    lastVideoOut = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH);
    // Debug video output/storage
    backgroundVideoBuffer?: Uint32Array;
    tilesetVideoBuffer?: Uint32Array;

    // General use
    /** @link https://gbdev.io/pandocs/LCDC.html */
    lcdControl = new SubRegister(0x91);
    /** @link https://gbdev.io/pandocs/STAT.html */
    lcdStatus = new PaddedSubRegister(7, 0x85);

    // Positioning
    screenY = new SubRegister(0x00); // these two indicate position of the viewport
    screenX = new SubRegister(0x00); // in the background map

    lcdY = new SubRegister(0x00); // indicates currently drawn horizontal line
    lcdYCompare = new SubRegister(0x00);

    windowY = new SubRegister(0x00); // position of the window
    windowX = new SubRegister(0x00);

    // Palettes
    bgPalette = new SubRegister(0x00);
    objPalette0 = new SubRegister(0x00);
    objPalette1 = new SubRegister(0x00);

    colorOptions: Record<Int2, number> = {
        0b00: 0xffffffff, // white
        0b01: 0xffaaaaaa, // light gray
        0b10: 0xff555555, // dark gray
        0b11: 0xff000000, // black
    };

    constructor(output: GameBoyOutput) {
        this.output = output;
    }

    /**
     * This the GPU, effectively updating the screen-buffer and rendering it if it's done.
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
                .sort(([spriteA, indexA], [spriteB, indexB]) =>
                    spriteA.x === spriteB.x ? indexA - indexB : spriteA.x - spriteB.x
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

    pushOutput() {
        if (this.output.receive) {
            this.output.receive(this.lastVideoOut);
        }
        if (this.output.debugBackground) {
            const backgroundImg = this.debugBackground();
            this.output.debugBackground(backgroundImg);
        }
        if (this.output.debugTileset) {
            const tilesetImg = this.debugTileset();
            this.output.debugTileset(tilesetImg);
        }
    }

    /** Sets the current mode of the GPU, updating the STAT register. */
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
        if (this.lcdControl.flag(LCDC_BG_WIN_PRIO)) {
            this.drawBackground(bgPriorities);

            if (this.lcdControl.flag(LCDC_WIN_ENABLE)) {
                this.drawWindow(bgPriorities);
            }
        } else {
            this.fillWhite();
        }

        if (this.lcdControl.flag(LCDC_OBJ_ENABLE)) {
            this.drawObjects(system, bgPriorities);
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

    tileCache: { [key in number]: { valid: boolean; data: Int2[][] } | undefined } = {};

    /**
     * Returns the tile data as a 2D 8x8 array of shades (0-3)
     */
    getTile(tileAddress: number): Int2[][] {
        let cachedTile = this.tileCache[tileAddress >> 4];

        // Create cached tile if not done
        if (!cachedTile) {
            cachedTile = { valid: false, data: Array.from(Array(8), () => new Array(8)) };
            this.tileCache[tileAddress >> 4] = cachedTile;
        }

        if (!cachedTile.valid) {
            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                const tileDataH = this.readVram(tileAddress + tileY * 2);
                const tileDataL = this.readVram(tileAddress + tileY * 2 + 1);
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

    debugBackground() {
        const width = 256;
        const height = 256;
        if (this.backgroundVideoBuffer === undefined)
            this.backgroundVideoBuffer = new Uint32Array(width * height);

        // The tilemap used (a map of tile *pointers*)
        const tileMapLoc = this.lcdControl.flag(LCDC_BG_TILE_MAP_AREA) ? 0x9c00 : 0x9800;
        // The colors used
        const palette = this.bgAndWinPaletteColor();

        for (let i = 0; i < 1024; i++) {
            // Tile positions (0 <= n < 32)
            const posX = i % 32; // 32 tiles on width
            const posY = Math.floor(i / 32); // 32 tiles on height
            // Get the tile address
            const tileId = this.readVram(tileMapLoc + i);
            const tileAddress = this.getTileAddress(tileId);
            // Get tile data
            const tileData = this.getTile(tileAddress);
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
        const palette = this.bgAndWinPaletteColor();

        for (let i = 0; i < 0x180; i++) {
            const tileAddress = 0x8000 + i * 16;
            // Tile positions (0 <= n < 32)
            const posX = i % 16; // 20 tiles on width
            const posY = Math.floor(i / 16);
            // Get tile data
            const tileData = this.getTile(tileAddress);
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
        // Map of colors for each shade
        const palette = this.bgAndWinPaletteColor();

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
            // The ID (pointer) of the tile
            const tileAddress = this.readVram(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = this.getTileAddress(tileAddress);
            // Get the tile data
            const tileData = this.getTile(tileDataAddress);

            for (let innerX = 0; innerX < 8; innerX++) {
                const posX = i + innerX - scrollOffsetX;
                if (posX < 0) continue;
                // Get the RGBA color, and draw it!
                const colorId = tileData[innerX][tileInnerY];
                this.videoBuffer[bufferStart + posX] = palette[colorId];
                if (colorId > 0) {
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
        // Map of colors for each shade
        const palette = this.bgAndWinPaletteColor();

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
            // The ID (pointer) of the tile
            const tileAddress = this.readVram(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = this.getTileAddress(tileAddress);
            // Get the tile data
            const tileData = this.getTile(tileDataAddress);

            for (let innerX = 0; innerX < 8; innerX++) {
                const posX = i + innerX;
                if (posX < 0) continue;
                // Get the RGBA color, and draw it!
                const colorId = tileData[innerX][tileInnerY];
                this.videoBuffer[bufferStart + posX] = palette[colorId];
                if (colorId > 0) {
                    priorities[posX] = true;
                }
            }
        }
    }

    drawObjects(system: System, priorities: boolean[]) {
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
            const palette = this.objPaletteColors(sprite.paletteNumber ? 1 : 0);

            // Start of video buffer for this line
            const bufferStart = y * SCREEN_WIDTH;

            // Get tile colors
            const tileData = this.getTile(tileAddress);

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

    /** An object containing the RGBA colors for each color ID in the background and window. */
    bgAndWinPaletteColor(): Record<Int2, number> {
        const palette = this.bgPalette.get();
        return {
            0b00: this.colorOptions[((palette >> 0) & 0b11) as Int2],
            0b01: this.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: this.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: this.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }
    /** An object containing the RGBA colors for each color ID for objects.  */
    objPaletteColors(id: 0 | 1) {
        const palette = (id === 0 ? this.objPalette0 : this.objPalette1).get();
        return {
            0b00: 0x00000000, // unused, color 0b00 is transparent
            0b01: this.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: this.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: this.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }

    /** Allows reading the VRAM bypassing restrictions. */
    readVram(pos: number) {
        return this.vram.read(pos - 0x8000);
    }

    address(pos: number): [Addressable, number] {
        // VRAM
        if (0x8000 <= pos && pos <= 0x9fff) return [this.vram, pos - 0x8000];
        // OAM
        if (0xfe00 <= pos && pos <= 0xfe9f) return [this.oam, pos];
        // Registers
        switch (pos) {
            case 0xff40:
                return [this.lcdControl, 0];
            case 0xff41:
                return [this.lcdStatus, 0];
            case 0xff42:
                return [this.screenY, 0];
            case 0xff43:
                return [this.screenX, 0];
            case 0xff44:
                return [this.lcdY, 0];
            case 0xff45:
                return [this.lcdYCompare, 0];
            case 0xff46:
                return [this.oam, pos];
            case 0xff47:
                return [this.bgPalette, 0];
            case 0xff48:
                return [this.objPalette0, 0];
            case 0xff49:
                return [this.objPalette1, 0];
            case 0xff4a:
                return [this.windowY, 0];
            case 0xff4b:
                return [this.windowX, 0];
            default:
                break;
        }

        throw new Error(`Invalid address given to GPU: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const [component, address] = this.address(pos);
        if (component === this.oam && !this.canReadOam) return 0xff;
        if (component === this.vram && !this.canReadVram) return 0xff;
        return component.read(address);
    }
    write(pos: number, data: number): void {
        const [component, address] = this.address(pos);

        if (component === this.oam && !this.canWriteOam) return;
        if (component === this.vram && !this.canWriteOam) return;

        if (
            component === this.vram &&
            0x8000 <= pos &&
            pos <= 0x9800 &&
            data !== component.read(address)
        ) {
            const cachedTile = this.tileCache[pos >> 4];
            if (cachedTile) cachedTile.valid = false;
        }
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
 * GPU class. However this isn't possible. As such we instead create an exported class that
 * has all the public attributes of GPU, and choose to not export the GPU that has all its
 * fields as public.
 * This means other classes can keep using GPU as it was and don't have access to anything else,
 * but inside of the file everything is public and usable.
 */
class GPUExported implements Addressable {
    protected gpu: GPU;

    constructor(output: GameBoyOutput) {
        this.gpu = new GPU(output);
    }

    tick(system: System): void {
        this.gpu.tick(system);
    }

    pushOutput(): void {
        this.gpu.pushOutput();
    }

    read(pos: number): number {
        return this.gpu.read(pos);
    }

    write(pos: number, data: number): void {
        return this.gpu.write(pos, data);
    }
}

export default GPUExported;
