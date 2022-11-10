import Addressable from "./Addressable";

/**
 * Simple abstract memory object.
 */
class AbstractMemory implements Addressable {
    protected size: number;
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
 * ROM memory - a memory location that can not be edited and is defined
 * on creation.
 */
class ROM extends AbstractMemory {
    constructor(data: Uint8Array) {
        super(data.length, data);
        console.log("saved data ", this.data);
    }

    write(pos: number, data: number): void {
        console.warn(`ignored writing ${data.toString(16)} to rom at ${pos.toString(16)}`);
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

export { ROM, RAM };
