export const high = (x: number) => (x >> 8) & 0xff;
export const low = (x: number) => x & 0xff;
export const combine = (high: number, low: number) => (high << 8) | low;
export const wrap8 = (x: number) => (x + 2 ** 8) % 2 ** 8;
export const wrap16 = (x: number) => (x + 2 ** 16) % 2 ** 16;