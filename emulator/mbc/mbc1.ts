import { RAM } from "../Memory";
import { SubRegister } from "../Register";
import { Int8Map } from "../util";
import MBC from "./abstract";

const RAM_ENABLED = 0x0a;

/**
 * Implementation of MBC1.
 * @link https://gbdev.io/pandocs/MBC1.html
 */
class MBC1 extends MBC {
    /** @link https://gbdev.io/pandocs/MBC1.html#00001fff--ram-enable-write-only */
    protected ramEnable: SubRegister = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/MBC1.html#20003fff--rom-bank-number-write-only */
    protected romBank: SubRegister = new SubRegister(0x01);
    /** @link https://gbdev.io/pandocs/MBC1.html#40005fff--ram-bank-number--or--upper-bits-of-rom-bank-number-write-only */
    protected ramBank: SubRegister = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/MBC1.html#60007fff--banking-mode-select-write-only */
    protected bankingModeSelect: SubRegister = new SubRegister(0x00);
    /** The RAM contained in the ROM (ERAM). */
    protected ram: RAM;

    constructor(data: StaticArray<u8>, hasRam: boolean) {
        super(data);

        // Indicated in header https://gbdev.io/pandocs/The_Cartridge_Header.html#0149--ram-size
        const ramSizeCode = data[0x0149];
        const ramSize = MBC.ramSizes.get(ramSizeCode);
        this.ram = new RAM(ramSize);
    }

    /**
     * Resolves a GameBoy address to an address in the ERAM. This uses the banking mode and
     * the current RAM bank to determine the address.
     */
    protected resolveERAMAddress(pos: number): number {
        const mode = this.bankingModeSelect.get() as bool;
        const pos12bits = pos & ((1 << 13) - 1);
        const ramAddressMask = this.ram.size - 1; // works for powers of 2
        const address = pos12bits | (mode === 0 ? 0 : this.ramBank.get() << 13);
        return address & ramAddressMask;
    }

    /**
     * Reads from the ROM, taking into account banking and the control ROMs.
     * @link https://gbdev.io/pandocs/MBC1.html#addressing-diagrams
     */
    read(pos: u16): u8 {
        const mode = this.bankingModeSelect.get() as bool;
        const addressMask = this.size - 1; // works for powers of 2
        switch (pos >> 12) {
            case 0x0:
            case 0x1:
            case 0x2:
            case 0x3: {
                const address = mode ? (this.ramBank.get() << 19) | pos : pos;
                return this.data[address & addressMask];
            }
            case 0x4:
            case 0x5:
            case 0x6:
            case 0x7: {
                const address =
                    (pos & ((1 << 14) - 1)) |
                    (this.romBank.get() << 14) |
                    (this.ramBank.get() << 19);
                return this.data[address & addressMask];
            }
            case 0xa:
            case 0xb: {
                // RAM disabled
                if (this.ramEnable.get() !== RAM_ENABLED) return 0xff;
                const address = this.resolveERAMAddress(pos);
                return this.ram.read(address);
            }
        }
        throw new Error(`Invalid address to read from MBC1: ${pos.toString(16)}`);
    }

    write(pos: u16, data: u8): void {
        switch (pos >> 12) {
            case 0x0: // RAM enable
            case 0x1:
                return this.ramEnable.set(data & 0b1111); // 4 bit register

            case 0x2: // ROM Bank Number
            case 0x3:
                const bits5 = data & 0b11111; // 5bit register
                // Can't set ROM bank to 0
                // In reality what happens is that a value of 0 is *interpreted* as 1. However
                // simply overriding the write produces the same effect and is simpler.
                return this.romBank.set(bits5 === 0 ? 1 : bits5);

            case 0x4: // RAM Bank Number
            case 0x5:
                return this.ramBank.set(data & 0b11); // 2bit register

            case 0x6: // Banking Mode Select
            case 0x7:
                return this.bankingModeSelect.set(data & 0b1); // 1bit register

            case 0xa: // ERAM Write
            case 0xb:
                if (this.ramEnable.get() !== RAM_ENABLED) return; // RAM disabled

                const address = this.resolveERAMAddress(pos);
                return this.ram.write(address, data);
        }

        throw new Error(`Invalid address to write to MBC1: ${pos.toString(16)}`);
    }
}

export default MBC1;
