import { AbstractMemory, RAM } from "../Memory";

abstract class MBC extends AbstractMemory {
    static readonly RAM_SIZES: Partial<Record<number, number>> = {
        0x00: 0,
        0x01: 0, // this is unofficial, only used by homebrew roms
        0x02: 1024 * 8,
        0x03: 1024 * 32,
        0x04: 1024 * 128,
        0x05: 1024 * 64,
    };

    protected ram: RAM | null = null;
    protected hasSaves: boolean = false;

    constructor(data: Uint8Array, hasSaves: boolean) {
        super(data.length, data);
        this.hasSaves = hasSaves;
    }

    /** Returns this ROMs data if it supports saves, null otherwise. */
    save(): Uint8Array | null {
        return this.hasSaves && this.ram ? this.ram.rawData() : null;
    }

    /** Loads a save for this ROM. */
    load(data: Uint8Array): void {
        if (!this.hasSaves || !this.ram) return;

        if (data.length !== this.ram.size)
            throw new Error(
                `[MBC] Save data is not the same size as the RAM! Got ${data.length} bytes, expected ${this.ram.size} bytes.`
            );

        this.ram.rawSet(data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
