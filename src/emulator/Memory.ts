import Addressable from "./Addressable";

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

export { AbstractMemory, RAM };
