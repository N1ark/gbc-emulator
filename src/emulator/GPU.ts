import Addressable from "./Addressable";
import Readable from "./Addressable";
import { IFLAG_LCDC, IFLAG_VBLANK, SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";
import { RAM } from "./Memory";
import { SubRegister } from "./Register";
import System from "./System";
import { wrap8 } from "./util";
import VideoOutput from "./VideoOutput";

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
    CYCLES: 80 + 172,
};
const MODE_HBLANK = {
    FLAG: 0b00,
    CYCLES: 80 + 172 + 204,
    INTERRUPT: 1 << 3,
};
const MODE_VBLANK = {
    FLAG: 0b01,
    CYCLES: (80 + 172 + 204) * SCREEN_HEIGHT,
    INTERRUPT: 1 << 4,
};

// Helpful constants
const SCREEN_HEIGHT_WOFFSCREEN = 154;
const CYCLES_VBLANK_EXTRA = 4560;

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
    // Internal counter for cycles at a frame level
    protected cycleCounter: number = 0;
    // Internal counter for cycles at a line level
    protected lineCycleCounter: number = 0;

    // Data Store
    protected vram = new RAM(8192); // 8Kb memory
    protected oam = new RAM(160); //

    // Video output/storage
    protected output: VideoOutput;
    protected videoBuffer = new Uint32Array(SCREEN_HEIGHT * SCREEN_WIDTH);

    // General use
    /** @link https://gbdev.io/pandocs/LCDC.html */
    protected lcdControl = new SubRegister(0x91);
    /** @link https://gbdev.io/pandocs/STAT.html */
    protected lcdStatus = new SubRegister(0x02);

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
        0b01: 0xaaaaaaff, // light gray
        0b10: 0x555555ff, // dark gray
        0b11: 0x000000ff, // black
    };

    constructor(output: VideoOutput) {
        this.output = output;
    }

    /**
     * This the GPU, effectively updating the screen-buffer and rendering it if it's done.
     * @link https://gbdev.io/pandocs/pixel_fifo.html
     */
    tick(cycles: number, system: System) {
    }

    /** Sets the current mode of the GPU, updating the STAT register. */
    protected setMode(mode: number) {
        this.lcdStatus.set((this.lcdStatus.get() & ~STAT_MODE) | mode);
    }

    /** Updates the current scanline, by rendering the background, window and then objects. */
    protected updateScanline() {
    }

    /** An object containing the RGBA colors for each color ID for objects.  */
    protected objPaletteColors(id: 0 | 1) {
        const palette = [this.objPalette0, this.objPalette1][id].get();
        return {
            0b00: 0x00000000, // unused, color 0b00 is transparent
            0b01: this.colorOptions[((palette >> 2) & 0xff) as Int2],
            0b10: this.colorOptions[((palette >> 4) & 0xff) as Int2],
            0b11: this.colorOptions[((palette >> 6) & 0xff) as Int2],
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
    }
}

export default GPU;
