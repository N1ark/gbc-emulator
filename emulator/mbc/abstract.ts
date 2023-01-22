import { AbstractMemory } from "../Memory";
import { Int8Map } from "../util";

abstract class MBC extends AbstractMemory {
    protected static readonly ramSizes: Int8Map<usize> = {
        0x00: 0,
        0x02: 1024 * 8,
        0x03: 1024 * 32,
        0x04: 1024 * 128,
        0x05: 1024 * 64,
    };

    constructor(data: StaticArray<u8>) {
        super(data.length, data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
