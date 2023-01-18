export const high = (x: number) => (x >> 8) & 0xff;
export const low = (x: number) => x & 0xff;
export const combine = (high: number, low: number) => (high << 8) | low;
export const wrap8 = (x: number) => (x + 2 ** 8) % 2 ** 8;
export const wrap16 = (x: number) => (x + 2 ** 16) % 2 ** 16;
export const asSignedInt8 = (x: number) => (x > 127 ? x - 256 : x);
export const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);
export const range = (from: number, to: number) =>
    [...new Array(to - from + 1)].map((_, i) => i + from);
export const rangeObject = <T>(from: number, to: number, obj: T) =>
    Object.fromEntries(range(from, to).map((i) => [i, obj]));

export type Int1 = 0 | 1;
export type Int2 = 0 | 1 | 2 | 3;
export type Int3 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Int4 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
