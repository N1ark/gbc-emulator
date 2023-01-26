import { AbstractMemory } from "../Memory";

abstract class MBC extends AbstractMemory {
    static readonly RAM_SIZES: Partial<Record<number, number>> = {
        0x00: 0,
        0x01: 0, // this is unofficial, only used by homebrew roms
        0x02: 1024 * 8,
        0x03: 1024 * 32,
        0x04: 1024 * 128,
        0x05: 1024 * 64,
    };

    constructor(data: Uint8Array) {
        super(data.length, data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
