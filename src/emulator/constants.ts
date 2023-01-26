// CPU
export const CLOCK_SPEED = 4194304; // 2^22Hz
export const FRAME_RATE = 60;
export const CYCLES_PER_FRAME = Math.floor(CLOCK_SPEED / FRAME_RATE);

// Screen
export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 144;

// Memory
export const HRAM_SIZE = 352;
export const WRAM_SIZE = 8 * 1024;

// Interrupt flags
export const IFLAG_VBLANK = 1 << 0;
export const IFLAG_LCDC = 1 << 1;
export const IFLAG_TIMER = 1 << 2;
export const IFLAG_SERIAL = 1 << 3;
export const IFLAG_JOYPAD = 1 << 4;

// Types
export enum ConsoleType {
    DMG,
    CGB,
}
export enum SpeedMode {
    Normal,
    Double,
}
export enum CGBMode {
    CGB,
    DMG,
    DMGExtended,
}
