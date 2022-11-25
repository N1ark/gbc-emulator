import { AbstractMemory } from "../Memory";

abstract class MBC extends AbstractMemory {
    constructor(data: Uint8Array) {
        super(data.length, data);
    }

    read(pos: number): number {
        return this.data[pos];
    }
    write(pos: number, data: number): void {
        this.data[pos] = data;
    }
}

export default MBC;
