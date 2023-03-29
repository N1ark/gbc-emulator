import { Addressable, CircularRAM } from "./Memory";
import { MaskRegister } from "./Register";

const WRAM_SIZE = 0x2000;
const WRAM_BANK_INDEX = 0b111;
const WRAM_BANK_SIZE = 0x1000;

class DMGWRAM extends CircularRAM {
    constructor() {
        super(WRAM_SIZE, 0xc000);
    }
}

class GBCWRAM implements Addressable {
    protected bank0 = new CircularRAM(WRAM_BANK_SIZE, 0x0000);
    // For convenience, we create the 7 banks and map them to the 8 possible bank indices, since
    // a bank index of 0 is mapped to bank 1.
    protected banks1To7 = (() => {
        const banks = [...new Array(7)].map(() => new CircularRAM(WRAM_BANK_SIZE, 0x1000));
        return [banks[0], banks[0], banks[1], banks[2], banks[3], banks[4], banks[5], banks[6]];
    })();
    protected wramBank = new MaskRegister(0b1111_1000);

    protected address(address: number): Addressable {
        if (address === 0xff70) return this.wramBank;
        // we need to do modulo, since in reality WRAM is a circular buffer
        return (address - 0xc000) % WRAM_SIZE < WRAM_BANK_SIZE
            ? this.bank0
            : this.banks1To7[this.wramBank.get() & WRAM_BANK_INDEX];
    }

    read(address: number): number {
        return this.address(address).read(address);
    }

    write(address: number, value: number): void {
        this.address(address).write(address, value);
    }
}

export { DMGWRAM, GBCWRAM };
