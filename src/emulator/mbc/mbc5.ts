import { RAM } from "../Memory";
import { Register } from "../Register";
import MBC from "./abstract";

const RAM_ENABLED = 0x0a;

type MBC5Params = {
    hasRam: boolean;
    hasRumble: boolean;
    hasBattery: boolean;
};

/**
 * Implementation of MBC5.
 * @link https://gbdev.io/pandocs/MBC5.html
 */
class MBC5 extends MBC {
    /** @link https://gbdev.io/pandocs/MBC5.html#0000-1fff---ram-enable-write-only */
    protected ramEnable = new Register(0x00);
    /** @link https://gbdev.io/pandocs/MBC5.html#2000-2fff---8-least-significant-bits-of-rom-bank-number-write-only */
    protected romBankLower8 = new Register(0x01);
    /** @link https://gbdev.io/pandocs/MBC5.html#3000-3fff---9th-bit-of-rom-bank-number-write-only */
    protected romBankUpper1 = new Register(0x00);
    /** @link https://gbdev.io/pandocs/MBC5.html#4000-5fff---ram-bank-number-write-only */
    protected ramBank = new Register(0x00);
    /** The RAM contained in the ROM (ERAM). */
    protected ram: RAM;

    constructor(data: Uint8Array, { hasRam, hasRumble, hasBattery }: MBC5Params) {
        super(data, hasBattery);
        this.ram = this.createRAM();
    }

    /**
     * Resolves a GameBoy address to an address in the ERAM. This uses the current RAM bank to
     * determine the address.
     */
    protected resolveERAMAddress(pos: number): number {
        const pos12bits = pos & ((1 << 13) - 1);
        const ramAddressMask = this.ram.size - 1; // works for powers of 2
        const address = pos12bits | (this.ramBank.get() << 13);
        return address & ramAddressMask;
    }

    /**
     * Reads from the ROM, taking into account banking and the control ROMs.
     * @link https://gbdev.io/pandocs/MBC5.html#memory
     */
    read(pos: number): number {
        const addressMask = this.size - 1; // works for powers of 2
        switch (pos >> 12) {
            case 0x0: // ROM bank 00
            case 0x1:
            case 0x2:
            case 0x3: {
                return this.rom.read(pos & addressMask);
            }
            case 0x4:
            case 0x5:
            case 0x6:
            case 0x7: {
                const address =
                    (pos & ((1 << 14) - 1)) |
                    (this.romBankLower8.get() << 14) |
                    (this.romBankUpper1.get() << 22);
                return this.rom.read(address & addressMask);
            }
            case 0xa: // ERAM
            case 0xb: {
                if (this.ramEnable.get() !== RAM_ENABLED) return 0xff;
                const address = this.resolveERAMAddress(pos);
                return this.ram.read(address);
            }
        }

        throw new Error(`Invalid address to read from MBC5: ${pos.toString(16)}`);
    }

    write(pos: number, data: number): void {
        switch (pos >> 12) {
            case 0x0: // RAM enable
            case 0x1:
                return this.ramEnable.set(data & 0b1111); // 4 bit register

            case 0x2: // ROM Bank Number (lower 8 bits)
                return this.romBankLower8.set(data);

            case 0x3: // ROM Bank Number (upper 1 bit)
                return this.romBankUpper1.set(data & 0b1); // 1 bit register

            case 0x4: // RAM Bank Number
            case 0x5:
                return this.ramBank.set(data & 0b11); // 2bit register

            case 0x6: // Nothing here
            case 0x7:
                return;

            case 0xa: // ERAM Write
            case 0xb:
                if (this.ramEnable.get() !== RAM_ENABLED) return; // RAM disabled
                const address = this.resolveERAMAddress(pos);
                return this.ram.write(address, data);
        }
        throw new Error(`Invalid address to write to MBC5: ${pos.toString(16)}`);
    }
}

export default MBC5;
