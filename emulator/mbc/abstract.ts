import { AbstractMemory } from "../Memory";
import { filledMap, Int8Map } from "../util";

abstract class MBC extends AbstractMemory {
    protected static readonly ramSizes: Int8Map<usize> = filledMap<u8, usize>(
        [0x00, 0x02, 0x03, 0x04, 0x05],
        [0, 1024 * 8, 1024 * 32, 1024 * 128, 1024 * 64]
    );

    constructor(data: StaticArray<u8>) {
        super(data.length, data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
