export const high = (x: number) => (x >> 8) & 0xff;
export const low = (x: number) => x & 0xff;
export const combine = (high: number, low: number) => (high << 8) | low;
export const wrap8 = (x: number) => (x + 2 ** 8) % 2 ** 8;
export const wrap16 = (x: number) => (x + 2 ** 16) % 2 ** 16;
export const asSignedInt8 = (x: number) => (x > 127 ? x - 256 : x);

export type Int2 = 0 | 1 | 2 | 3;
export type Int4 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
