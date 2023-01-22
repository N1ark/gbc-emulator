import { WRAM_SIZE } from "./constants";
import { Addressable, CircularRAM, RAM } from "./Memory";
import { PaddedSubRegister, SubRegister } from "./Register";

const WRAM_BANK_INDEX: u8 = 0b111;
const WRAM_BANK_SIZE: u16 = 0x1000;

class DMGWRAM extends CircularRAM {
    constructor() {
        super(WRAM_SIZE, 0xc000);
    }
}

class GBCWRAM implements Addressable {
    protected bank0: RAM = new CircularRAM(WRAM_BANK_SIZE, 0x0000);
    // For convenience, we create the 7 banks and map them to the 8 possible bank indices, since
    // a bank index of 0 is mapped to bank 1.
    protected banks1To7: StaticArray<Addressable> = new StaticArray(8);
    protected wramBank: SubRegister = new PaddedSubRegister(0b1111_1000, 1);

    constructor() {
        for (let i = 1; i < 8; i++) {
            this.banks1To7[i] = new CircularRAM(WRAM_BANK_SIZE, 0x1000);
        }
        this.banks1To7[0] = new CircularRAM(WRAM_BANK_SIZE, 0x1000);
    }

    protected address(address: u16): Addressable {
        if (address === 0xff70) return this.wramBank;
        // we need to do modulo, since in reality WRAM is a circular buffer
        return (address - 0xc000) % WRAM_SIZE < WRAM_BANK_SIZE
            ? this.bank0
            : this.banks1To7[this.wramBank.get() & WRAM_BANK_INDEX];
    }

    read(address: u16): u8 {
        return this.address(address).read(address);
    }

    write(address: u16, value: u8): void {
        this.address(address).write(address, value);
    }
}

export { DMGWRAM, GBCWRAM };
