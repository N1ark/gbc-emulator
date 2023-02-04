import { RAM } from "../Memory";
import { Register } from "../Register";
import MBC from "./abstract";

const RAM_ENABLED = 0x0a;
const MBC2_ROM_BANK = 1 << 8;

type MBC2Params = {
    hasBattery: boolean;
};

/**
 * Implementation of MBC2.
 * @link https://gbdev.io/pandocs/MBC2.html
 */
class MBC2 extends MBC {
    /** @link https://gbdev.io/pandocs/MBC2.html#00003fff--ram-enable-rom-bank-number-write-only */
    protected ramEnable = new Register(0x00);
    /** @link https://gbdev.io/pandocs/MBC1.html#20003fff--rom-bank-number-write-only */
    protected romBank = new Register(0x01);
    /** The RAM contained in the ROM (ERAM). */
    protected ram: RAM = new RAM(512);

    constructor(data: Uint8Array, { hasBattery }: MBC2Params) {
        super(data, hasBattery);
    }

    /**
     * Reads from the ROM, taking into account banking and the control ROMs.
     * @link https://gbdev.io/pandocs/MBC1.html#addressing-diagrams
     */
    read(pos: number): number {
        switch (pos >> 12) {
            case 0x0:
            case 0x1:
            case 0x2:
            case 0x3: {
                return this.data[pos];
            }
            case 0x4:
            case 0x5:
            case 0x6:
            case 0x7: {
                const addressMask = this.size - 1; // works for powers of 2
                const address = (pos & ((1 << 14) - 1)) | (this.romBank.get() << 14);
                return this.data[address & addressMask];
            }
            case 0xa:
            case 0xb: {
                // RAM disabled
                if (this.ramEnable.get() !== RAM_ENABLED) return 0xff;
                return this.ram.read(pos & 0x1ff);
            }
        }
        throw new Error(`Invalid address to read from MBC1: ${pos.toString(16)}`);
    }

    write(pos: number, data: number): void {
        switch (pos >> 12) {
            case 0x0: // RAM enable / ROM Bank Numbers
            case 0x1:
            case 0x2:
            case 0x3:
                data = data & 0b1111;
                // bit 8 controls the register
                if (pos & MBC2_ROM_BANK) {
                    // Can't set ROM bank to 0
                    // In reality what happens is that a value of 0 is *interpreted* as 1. However
                    // simply overriding the write produces the same effect and is simpler.
                    return this.romBank.set(data === 0 ? 1 : data);
                } else {
                    return this.ramEnable.set(data);
                }

            case 0xa:
            case 0xb: {
                // RAM disabled
                if (this.ramEnable.get() !== RAM_ENABLED) return;
                return this.ram.write(pos & 0x1ff, data | 0xf0);
            }
        }

        return;
    }
}

export default MBC2;
