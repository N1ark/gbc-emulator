import { AbstractMemory } from "../Memory";

abstract class MBC extends AbstractMemory {
    constructor(data: Uint8Array) {
        super(data.length, data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
