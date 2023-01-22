import { RAM } from "../Memory";
import { SubRegister } from "../Register";
import { Int8Map } from "../util";
import MBC from "./abstract";

const RAM_ENABLED = 0x0a;

type MBC3Params = {
    hasRam: boolean;
    hasTimer: boolean;
};

/**
 * Implementation of MBC3.
 * @link https://gbdev.io/pandocs/MBC3.html
 */
class MBC3 extends MBC {
    /** @link https://gbdev.io/pandocs/MBC3.html#0000-1fff---ram-and-timer-enable-write-only */
    protected ramEnable = new SubRegister(0x00);
    /** @link https://gbdev.io/pandocs/MBC3.html#2000-3fff---rom-bank-number-write-only */
    protected romBank = new SubRegister(0x01);
    /** @link https://gbdev.io/pandocs/MBC3.html#4000-5fff---ram-bank-number---or---rtc-register-select-write-only */
    protected ramBank = new SubRegister(0x00);
    /** The RAM contained in the ROM (ERAM). */
    protected ram: RAM;

    /**
     * RTC registers
     * @link https://gbdev.io/pandocs/MBC3.html#the-clock-counter-registers
     */
    protected rtcS = new SubRegister(0x00);
    protected rtcM = new SubRegister(0x00);
    protected rtcH = new SubRegister(0x00);
    protected rtcDL = new SubRegister(0x00);
    protected rtcDH = new SubRegister(0x00);

    protected rtcRegisters: Int8Map<SubRegister | undefined> = {
        0x08: this.rtcS,
        0x09: this.rtcM,
        0x0a: this.rtcH,
        0x0b: this.rtcDL,
        0x0c: this.rtcDH,
    };

    constructor(data: StaticArray<u8>, { hasRam, hasTimer }: MBC3Params) {
        super(data);

        // Indicated in header https://gbdev.io/pandocs/The_Cartridge_Header.html#0149--ram-size
        const ramSizeCode = this.data[0x0149];
        const ramSize = MBC.ramSizes[ramSizeCode];
        if (ramSize === undefined)
            throw new Error(`Invalid RAM size header value: ${ramSizeCode.toString(16)}`);
        this.ram = new RAM(ramSize);
    }

    /**
     * Resolves a GameBoy address to an address in the ERAM. This uses the banking mode and
     * the current RAM bank to determine the address.
     */
    protected resolveERAMAddress(pos: number): number {
        const pos12bits = pos & ((1 << 13) - 1);
        const ramAddressMask = this.ram.size - 1; // works for powers of 2
        const address = pos12bits | (this.ramBank.get() << 13);
        return address & ramAddressMask;
    }

    /**
     * Reads from the ROM, taking into account banking and the control ROMs.
     * @link https://gbdev.io/pandocs/MBC3.html#memory
     */
    read(pos: number): number {
        const addressMask = this.size - 1; // works for powers of 2
        switch (pos >> 12) {
            case 0x0: // ROM Bank 00
            case 0x1:
            case 0x2:
            case 0x3:
                return this.data[pos & addressMask];

            case 0x4: // ROM Bank 1-7
            case 0x5:
            case 0x6:
            case 0x7:
                const address = (pos & ((1 << 14) - 1)) | (this.romBank.get() << 14);
                return this.data[address & addressMask];

            case 0xa: // ERAM
            case 0xb:
                // TODO: check for RTC register ?
                // RAM disabled
                if (this.ramEnable.get() !== RAM_ENABLED) return 0xff;

                const ramBank = this.ramBank.get();
                if (ramBank > 0x03) {
                    return this.rtcRegisters[ramBank]!.get();
                }

                const eramAddress = this.resolveERAMAddress(pos);
                return this.ram.read(eramAddress);
        }
        throw new Error(`Invalid address to read from MBC3: ${pos.toString(16)}`);
    }

    write(pos: number, data: number): void {
        switch (pos >> 12) {
            case 0x0: // RAM and timer enable
            case 0x1:
                return this.ramEnable.set(data & 0b1111); // 4 bit register

            case 0x2: // ROM Bank Number
            case 0x3:
                const bits = data & 0b0111_1111; // 7bit register
                // Can't set ROM bank to 0
                // In reality what happens is that a value of 0 is *interpreted* as 1. However
                // simply overriding the write produces the same effect and is simpler.
                return this.romBank.set(bits === 0 ? 1 : bits);

            case 0x4: // RAM Bank Number or RTC Register Select
            case 0x5:
                if (data > 0x0c) {
                    console.error(
                        `Invalid RAM bank number in MBC3 (write ignored): ${data.toString(16)}`
                    );
                    return;
                }
                return this.ramBank.set(data);

            case 0x6: // Latch clock data
            case 0x7:
                // TODO: check if writes 0, then 1, then latch
                return;

            case 0xa: // ERAM Write
            case 0xb:
                if (this.ramEnable.get() !== RAM_ENABLED) return; // RAM disabled
                if (this.ramBank.get() > 0x03) return; // TODO: RTC registers
                const address = this.resolveERAMAddress(pos);
                return this.ram.write(address, data);
        }

        throw new Error(`Invalid address to write to MBC3: ${pos.toString(16)}`);
    }
}

export default MBC3;
