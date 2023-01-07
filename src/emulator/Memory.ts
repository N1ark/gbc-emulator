/**
 * A basic interface for all addressable objects.
 */
interface Addressable {
    read(pos: number): number;
    write(pos: number, data: number): void;
}

/**
 * Simple abstract memory object.
 */
class AbstractMemory implements Addressable {
    size: number;
    protected data: Uint8Array;

    constructor(size: number, data?: Uint8Array) {
        this.size = size;
        this.data = data ?? new Uint8Array(size);
    }

    read(pos: number) {
        return this.data[pos];
    }

    write(pos: number, data: number): void {
        throw new Error("write is not implemented for this object.");
    }
}

/**
 * Live memory, that can be read from and written to.
 */
class RAM extends AbstractMemory {
    write(pos: number, data: number) {
        this.data[pos] = data;
    }
}

/**
 * Circular RAM is similar to RAM, but it also stores an offset. Any access on the memory (both
 * reads and writes) occur at the position (X - O) % S, where S is the size of the memory, O the
 * offset, and X the accessed address. This means out of bound exeptions cannot happen.
 */
class CircularRAM extends RAM {
    protected offset: number;

    constructor(size: number, offset: number, data?: Uint8Array) {
        super(size, data);
        this.offset = offset;
    }

    override read(pos: number): number {
        return super.read((pos - this.offset) % this.size);
    }

    override write(pos: number, data: number): void {
        super.write((pos - this.offset) % this.size, data);
    }
}

export type { Addressable };
export { AbstractMemory, RAM, CircularRAM };
