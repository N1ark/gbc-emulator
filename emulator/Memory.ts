/**
 * A basic interface for all addressable objects.
 */
interface Addressable {
    read(pos: u16): u8;
    write(pos: u16, data: u8): void;
}

/**
 * Simple abstract memory object.
 */
class AbstractMemory implements Addressable {
    size: i32;
    protected data: StaticArray<u8>;

    constructor(size: i32, data: StaticArray<u8> | null = null) {
        this.size = size;
        this.data = data || new StaticArray<u8>(size);
    }

    read(pos: u16): u8 {
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

export { Addressable, AbstractMemory, RAM, CircularRAM };
