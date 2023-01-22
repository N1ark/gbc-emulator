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
    size: u16;
    protected data: StaticArray<u8>;

    constructor(size: u16, data?: StaticArray<u8>) {
        this.size = size;
        this.data = data ?? new StaticArray<u8>(size);
    }

    read(pos: u16) {
        return this.data[pos];
    }

    write(pos: u16, data: u8): void {
        throw new Error("write is not implemented for this object.");
    }
}

/**
 * Live memory, that can be read from and written to.
 */
class RAM extends AbstractMemory {
    write(pos: u16, data: u8): void {
        this.data[pos] = data;
    }
}

/**
 * Circular RAM is similar to RAM, but it also stores an offset. Any access on the memory (both
 * reads and writes) occur at the position (X - O) % S, where S is the size of the memory, O the
 * offset, and X the accessed address. This means out of bound exeptions cannot happen.
 */
class CircularRAM extends RAM {
    protected offset: u16;

    constructor(size: u16, offset: u16, data?: StaticArray<u8>) {
        super(size, data);
        this.offset = offset;
    }

    override read(pos: u16): number {
        return super.read((pos - this.offset) % this.size);
    }

    override write(pos: u16, data: u8): void {
        super.write((pos - this.offset) % this.size, data);
    }
}

export type { Addressable };
export { AbstractMemory, RAM, CircularRAM };
