import Addressable from "./Addressable";
import Readable from "./Addressable";
import { IFLAG_LCDC, IFLAG_VBLANK, SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";
import { RAM } from "./Memory";
import { SubRegister } from "./Register";
import System from "./System";
import { asSignedInt8, wrap8 } from "./util";
import GameBoyOutput from "./GameBoyOutput";

type Int2 = 0 | 1 | 2 | 3;

/*
 * All modes, with:
 * - flag: corresponding STAT flag
 * - cycles: cycles until completion (including previous steps)
 * - interrupt?: optional corresponding STAT interrupt flag
 */
const MODE_SEARCHING_OAM = {
    FLAG: 0b10,
    CYCLES: 80,
    INTERRUPT: 1 << 5,
};
const MODE_TRANSFERRING = {
    FLAG: 0b11,
    CYCLES: 172,
};
const MODE_HBLANK = {
    FLAG: 0b00,
    CYCLES: 204,
    INTERRUPT: 1 << 3,
};
const MODE_VBLANK = {
    FLAG: 0b01,
    CYCLES: 456,
    INTERRUPT: 1 << 4,
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
class GPU implements Readable {
    // Internal counter for cycles
    protected cycleCounter: number = 0;

    // Data Store
    protected vram = new RAM(8192); // 8Kb memory
    protected oam = new RAM(160); //

    // Video output/storage
    protected output: GameBoyOutput;
    protected videoBuffer = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH).fill(0xff000000);

    // General use
    /** @link https://gbdev.io/pandocs/LCDC.html */
    protected lcdControl = new SubRegister(0x91);
    /** @link https://gbdev.io/pandocs/STAT.html */
    protected lcdStatus = new SubRegister(0x85);

    // Positioning
    protected screenY = new SubRegister(0x00); // these two indicate position of the viewport
    protected screenX = new SubRegister(0x00); // in the background map

    protected lcdY = new SubRegister(0x00); // indicates currently drawn horizontal line
    protected lcdYCompare = new SubRegister(0x00);

    protected windowY = new SubRegister(0x00); // position of the window
    protected windowX = new SubRegister(0x00);

    // Palettes
    protected bgPalette = new SubRegister(0x00);
    protected objPalette0 = new SubRegister(0x00);
    protected objPalette1 = new SubRegister(0x00);

    protected colorOptions: Record<Int2, number> = {
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
    tick(cycles: number, system: System) {
        this.cycleCounter += cycles;

        const currentMode = this.lcdStatus.get() & STAT_MODE;

        let needLcdcInterrupt = false;

        switch (currentMode as Int2) {
            case MODE_VBLANK.FLAG:
                if (this.cycleCounter >= MODE_VBLANK.CYCLES) {
                    this.cycleCounter -= MODE_VBLANK.CYCLES;
                    this.lcdY.set(wrap8(this.lcdY.get() + 1));
                    if (this.lcdY.get() >= 0x9a) {
                        this.lcdY.set(0);
                        this.setMode(MODE_SEARCHING_OAM.FLAG);
                        needLcdcInterrupt = this.lcdStatus.flag(MODE_SEARCHING_OAM.INTERRUPT);
                    }
                }
                break;
            case MODE_HBLANK.FLAG:
                if (this.cycleCounter >= MODE_HBLANK.CYCLES) {
                    this.cycleCounter -= MODE_HBLANK.CYCLES;
                    this.lcdY.set(wrap8(this.lcdY.get() + 1));
                    if (this.lcdY.get() === SCREEN_HEIGHT) {
                        this.setMode(MODE_VBLANK.FLAG);
                        needLcdcInterrupt = this.lcdStatus.flag(MODE_VBLANK.INTERRUPT);
                        system.requestInterrupt(IFLAG_VBLANK);
                        this.output.receive(this.videoBuffer);
                        if (this.output.debugBackground) {
                            const backgroundImg = this.debugBackground();
                            this.output.debugBackground(backgroundImg);
                        }
                        if (this.output.debugTileset) {
                            const tilesetImg = this.debugTileset();
                            this.output.debugTileset(tilesetImg);
                        }
                    } else {
                        this.setMode(MODE_SEARCHING_OAM.FLAG);
                        needLcdcInterrupt = this.lcdStatus.flag(MODE_SEARCHING_OAM.INTERRUPT);
                    }
                }
                break;
            case MODE_SEARCHING_OAM.FLAG:
                if (this.cycleCounter >= MODE_SEARCHING_OAM.CYCLES) {
                    this.cycleCounter -= MODE_SEARCHING_OAM.CYCLES;
                    this.setMode(MODE_TRANSFERRING.FLAG);
                    this.updateScanline(system);
                }
                break;
            case MODE_TRANSFERRING.FLAG:
                if (this.cycleCounter >= MODE_TRANSFERRING.CYCLES) {
                    this.cycleCounter -= MODE_TRANSFERRING.CYCLES;
                    this.setMode(MODE_HBLANK.FLAG);
                    needLcdcInterrupt = this.lcdStatus.flag(MODE_HBLANK.INTERRUPT);
                }
                break;
        }

        // The GPU constantly compares the LY and LCY, and needs interrupts when they match
        const doLycLyMatch = this.lcdY.get() == this.lcdYCompare.get();
        this.lcdStatus.sflag(STAT_LYC_LY_EQ_FLAG, doLycLyMatch);
        needLcdcInterrupt ||= doLycLyMatch && this.lcdStatus.flag(STAT_LYC_LY_EQ_INT);

        // Request interrupt if anything relevant happened
        if (needLcdcInterrupt) {
            system.requestInterrupt(IFLAG_LCDC);
        }
    }

    /** Sets the current mode of the GPU, updating the STAT register. */
    protected setMode(mode: number) {
        this.lcdStatus.set((this.lcdStatus.get() & ~STAT_MODE) | mode);
    }

    /** Updates the current scanline, by rendering the background, window and then objects. */
    protected updateScanline(system: System) {
        const bgPriorities = [...new Array(SCREEN_WIDTH)].fill(false);
        if (this.lcdControl.flag(LCDC_BG_WIN_PRIO)) {
            this.drawBackground(bgPriorities);
        }
        // if (this.lcdControl.flag(LCDC_WIN_ENABLE)) {
        //     this.drawBackgroundOrWindow("win", bgPriorities);
        // }
        if (this.lcdControl.flag(LCDC_OBJ_ENABLE)) {
            this.drawObjects(system, bgPriorities);
        }
    }

    protected tileCache: { [key in number]: { valid: boolean; data: Int2[][] } | undefined } =
        {};

    /**
     * Returns the tile data as a 2D 8x8 array of shades (0-3)
     */
    protected getTile(tileAddress: number): Int2[][] {
        let cachedTile = this.tileCache[tileAddress];

        // Create cached tile if not done
        if (!cachedTile) {
            cachedTile = { valid: false, data: [...new Array(8)].map(() => new Array(8)) };
            this.tileCache[tileAddress] = cachedTile;
        }

        if (!cachedTile.valid) {
            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                const tileDataH = this.read(tileAddress + tileY * 2);
                const tileDataL = this.read(tileAddress + tileY * 2 + 1);
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

    protected debugBackground() {
        const width = 256;
        const height = 256;
        const data = new Uint32Array(width * height);

        // Function to get access to the tile data, ie. the shades of a tile
        const toAddress = this.lcdControl.flag(LCDC_BG_WIN_TILE_DATA_AREA)
            ? // Unsigned regular, 0x8000-0x8fff
              (n: number) => 0x8000 + n * 16
            : // Signed offset, 0x9000-0x97ff for 0-127 and 0x8800-0x8fff for 128-255
              (n: number) => 0x9000 + asSignedInt8(n) * 16;
        // The tilemap used (a map of tile *pointers*)
        const tileMapLoc = this.lcdControl.flag(LCDC_BG_TILE_MAP_AREA) ? 0x9c00 : 0x9800;
        // The colors used
        const palette = this.bgAndWinPaletteColor();

        for (let i = 0; i < 1024; i++) {
            // Tile positions (0 <= n < 32)
            const posX = i % 32; // 32 tiles on width
            const posY = Math.floor(i / 32); // 32 tiles on height
            // Get the tile address
            const tileId = this.read(tileMapLoc + i);
            const tileAddress = toAddress(tileId);
            // Get tile data
            const tileData = this.getTile(tileAddress);
            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                for (let tileX = 0; tileX < 8; tileX++) {
                    const colorId = tileData[tileX][tileY];
                    const index = posX * 8 + posY * width * 8 + tileX + tileY * width;
                    data[index] = palette[colorId];
                }
            }
        }

        return data;
    }

    protected debugTileset() {
        const width = 128; // 16 * 8;
        const height = 192; // 24 * 8;
        const data = new Uint32Array(width * height).fill(0xff0000ff);

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
                    data[index] = palette[colorId];
                }
            }
        }
        return data;
    }

    protected drawBackground(priorities: boolean[]) {
        // Function to get access to the tile data, ie. the shades of a tile
        const toAddress = this.lcdControl.flag(LCDC_BG_WIN_TILE_DATA_AREA)
            ? // Unsigned regular, 0x8000-0x8fff
              (n: number) => 0x8000 + n * 16
            : // Signed offset, 0x9000-0x97ff for 0-127 and 0x8800-0x8fff for 128-255
              (n: number) => 0x9000 + asSignedInt8(n) * 16;

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
            const tileAddress = this.read(tileIndex);
            // Convert the ID to the actual address
            const tileDataAddress = toAddress(tileAddress);
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

    protected drawObjects(system: System, priorities: boolean[]) {
        const y = this.lcdY.get();
        const doubleObjects = this.lcdControl.flag(LCDC_OBJ_SIZE);
        // Height of objects in pixels
        const objHeight = doubleObjects ? 16 : 8;
        const sprites = system.getSprites();
        const drawnSprites = sprites
            .filter(
                // only get selected sprites
                (sprite) => sprite.y <= y && y < sprite.y + objHeight
            )
            .slice(0, 10); // only 10 sprites per scanline

        for (const sprite of drawnSprites) {
            // Get tile id (to get the actual data pointer)
            const tileId = sprite.tileIndex + (doubleObjects && y - sprite.y >= 8 ? 1 : 0);
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
                if (x < 0) continue;
                const tileX = sprite.xFlip ? 7 - innerX : innerX;
                const colorId = tileData[tileX][tileY];
                // if transparent, skip
                // also skip if bg/win should be above, and priority is set
                if (colorId === 0 || (sprite.bgAndWinOverObj && priorities[x])) continue;
                this.videoBuffer[bufferStart + x] = palette[colorId];
            }
        }
    }

    /** An object containing the RGBA colors for each color ID in the background and window. */
    protected bgAndWinPaletteColor(): Record<Int2, number> {
        const palette = this.bgPalette.get();
        return {
            0b00: this.colorOptions[((palette >> 0) & 0b11) as Int2],
            0b01: this.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: this.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: this.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }
    /** An object containing the RGBA colors for each color ID for objects.  */
    protected objPaletteColors(id: 0 | 1) {
        const palette = (id === 0 ? this.objPalette0 : this.objPalette1).get();
        return {
            0b00: 0x00000000, // unused, color 0b00 is transparent
            0b01: this.colorOptions[((palette >> 2) & 0b11) as Int2],
            0b10: this.colorOptions[((palette >> 4) & 0b11) as Int2],
            0b11: this.colorOptions[((palette >> 6) & 0b11) as Int2],
        };
    }

    /** Allows reading the VRAM bypassing restrictions. */
    protected readVram(pos: number) {
        return this.vram.read(pos - 0x8000);
    }

    protected address(pos: number): [Addressable, number] {
        const adresses: Partial<Record<number, SubRegister>> = {
            0xff40: this.lcdControl,
            0xff41: this.lcdStatus,
            0xff42: this.screenY,
            0xff43: this.screenX,
            0xff44: this.lcdY,
            0xff45: this.lcdYCompare,
            0xff47: this.bgPalette,
            0xff48: this.objPalette0,
            0xff49: this.objPalette1,
            0xff4a: this.windowY,
            0xff4b: this.windowX,
        };
        const register = adresses[pos];
        if (register) {
            return [register, 0];
        }

        if (0x8000 <= pos && pos <= 0x9fff) return [this.vram, pos - 0x8000];

        throw new Error(`Invalid address given to GPU: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const [component, address] = this.address(pos);
        return component.read(address);
    }
    write(pos: number, data: number): void {
        const [component, address] = this.address(pos);
        component.write(address, data);
        if (component === this.vram && 0x8000 <= pos && pos <= 0x9800) {
            const tileId = pos; // one tile every 16 bytes
            const cachedTile = this.tileCache[tileId];
            if (cachedTile) cachedTile.valid = false;
        }
    }
}

export default GPU;
