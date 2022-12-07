import { AbstractMemory } from "../Memory";

abstract class MBC extends AbstractMemory {
    constructor(data: Uint8Array) {
        super(data.length, data);
    }

    read(pos: number): number {
        if (0xa000 <= pos && pos <= 0xbfff) return 0xff; // eram
        return this.data[pos];
    }
    write(pos: number, data: number): void {
        if (0xa000 <= pos && pos <= 0xbfff) return; // eram
        this.data[pos] = data;
    }
}

export default MBC;
