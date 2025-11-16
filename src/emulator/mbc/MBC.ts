import { Addressable, RAM, ROM } from "../Memory";

abstract class MBC implements Addressable {
    static readonly RAM_SIZES: Partial<Record<number, number>> = {
        0x00: 0,
        0x01: 0, // this is unofficial, only used by homebrew roms
        0x02: 1024 * 8,
        0x03: 1024 * 32,
        0x04: 1024 * 128,
        0x05: 1024 * 64,
    };

    protected size: number;
    protected rom: ROM;
    protected ram: RAM | null = null;
    protected hasSaves: boolean = false;

    constructor(data: Uint8Array, hasSaves: boolean) {
        this.size = data.length;
        this.rom = new ROM(this.size, data);
        this.hasSaves = hasSaves;
    }

    /**
     * Creates a new RAM instance for this MBC. This must be called during construction. It reads
     * the RAM size from the ROM header and creates a new RAM instance with that size.
     * @link https://gbdev.io/pandocs/The_Cartridge_Header.html#0149--ram-size
     */
    protected createRAM(): RAM {
        const ramSizeCode = this.rom.read(0x0149);
        const ramSize = MBC.RAM_SIZES[ramSizeCode];
        if (ramSize === undefined)
            throw new Error(`Invalid RAM size header value: ${ramSizeCode.toString(16)}`);
        return new RAM(ramSize);
    }

    /** Returns true if this ROM supports saves, false otherwise. */
    supportsSaves(): boolean {
        return this.hasSaves;
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
                `[MBC] Save data is not the same size as the RAM! ` +
                    `Got ${data.length} bytes, expected ${this.ram.size} bytes.`,
            );

        this.ram.rawSet(data);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default MBC;
