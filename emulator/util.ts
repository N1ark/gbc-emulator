export const high = (x: u16): u8 => ((x >> 8) & 0xff) as u8;
export const low = (x: u16): u8 => (x & 0xff) as u8;
export const combine = (high: u8, low: u8): u16 => ((high << 8) as u16) | (low as u16);
export const clamp8 = (x: u8, min: u8, max: u8): u8 => (x < min ? min : x > max ? max : x);
export const range = (from: u16, to: u16): u16[] => {
    const out = new Array<u16>(to - from + 1);
    for (let i: u16 = 0; i < (out.length as u16); i++) out[i] = i + from;
    return out;
};
export function fillMap<N extends number, T>(from: N, to: N, map: Map<N, T>, obj: T): void {
    for (let i: N = from; i <= to; i++) map.set(i, obj);
}
export function filledMap<K, V>(keys: K[], values: V[]): Map<K, V> {
    const map = new Map<K, V>();
    for (let i: i32 = 0; i < keys.length; i++) {
        map.set(keys[i], values[i]);
    }
    return map;
}

export type u1 = u8;
export type u2 = u8;
export type u3 = u8;
export type u4 = u8;

export type Int8Map<T> = Map<u8, T>;
export type Int16Map<T> = Map<u16, T>;

export class Tuple<A, B> {
    constructor(public a: A, public b: B) {}
}
