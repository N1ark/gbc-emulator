// CPU
export const CLOCK_SPEED = 4194304;
export const FRAME_RATE = 60;
export const CYCLES_PER_FRAME = Math.floor(CLOCK_SPEED / FRAME_RATE);

// Screen
export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 144;

// Memory
export const HRAM_SIZE = 352;
export const WRAM_SIZE = 32768;

// Inputs
export const BUTTON_A = 1 << 0;
export const BUTTON_B = 1 << 1;
export const BUTTON_SELECT = 1 << 2;
export const BUTTON_START = 1 << 3;
export const ARROW_RIGHT = 1 << 0;
export const ARROW_LEFT = 1 << 1;
export const ARROW_UP = 1 << 2;
export const ARROW_DOWN = 1 << 3;

// Interrupt flags
export const IFLAG_VBLANK = 1 << 0;
export const IFLAG_LCDC = 1 << 1;
export const IFLAG_TIMER = 1 << 2;
export const IFLAG_SERIAL = 1 << 3;
export const IFLAG_JOYPAD = 1 << 4;

// Timer
export const DIV_INC_RATE = 16384;
