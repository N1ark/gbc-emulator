import { SubRegister } from "../Register";
import MBC from "./abstract";

/**
 * Implementation of MCB1.
 * @link https://gbdev.io/pandocs/MBC1.html
 */
class MBC1 extends MBC {
    /** @link https://gbdev.io/pandocs/MBC1.html#00001fff--ram-enable-write-only */
    protected ramEnable = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/MBC1.html#20003fff--rom-bank-number-write-only */
    protected romBank = new SubRegister(0x01);
    /** @link https://gbdev.io/pandocs/MBC1.html#40005fff--ram-bank-number--or--upper-bits-of-rom-bank-number-write-only */
    protected ramBank = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/MBC1.html#60007fff--banking-mode-select-write-only */
    protected bankingModeSelect = new SubRegister(0x00);

    /**
     * Reads from the ROM, taking into account banking and the control ROMs.
     * @link https://gbdev.io/pandocs/MBC1.html#addressing-diagrams
     */
    read(pos: number): number {
        const mode = this.bankingModeSelect.get() as 0 | 1;
        if (0x0000 <= pos && pos <= 0x3fff) {
            const address = mode === 0 ? pos : (this.ramBank.get() << 19) | pos;
            return this.data[address];
        }
        if (0x4000 <= pos && pos <= 0x7fff) {
            const address =
                (pos & ((1 << 14) - 1)) |
                (this.romBank.get() << 14) |
                (this.ramBank.get() << 19);
            return this.data[address];
        }
        if (0xa000 <= pos && pos <= 0xbfff) {
            const address = (pos & ((1 << 13) - 1)) | (this.ramBank.get() << 13);
            return this.data[address];
        }

        throw new Error(`Invalid address to read frmo MCB1: ${pos.toString(16)}`);
    }

    write(pos: number, data: number): void {
        if (0x0000 <= pos && pos <= 0x1fff) this.ramEnable.set(data);
        if (0x2000 <= pos && pos <= 0x3fff) this.romBank.set(data & 0b11111); // 5bit register
        if (0x4000 <= pos && pos <= 0x5fff) this.ramBank.set(data & 0b11); // 2bit register
        if (0x6000 <= pos && pos <= 0x7fff) this.bankingModeSelect.set(data & 0b1); // 1bit register
    }
}

export default MBC1;
