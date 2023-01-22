import { Addressable, RAM } from "./Memory";
import { SubRegister } from "./Register";
import { u1, u3 } from "./util";

export class Sprite {
    constructor(
        public x: u8 = 0,
        public y: u8 = 0,
        public tileIndex: u8 = 0,
        // From attributes:
        public xFlip: bool = 0,
        public yFlip: bool = 0,
        public bgAndWinOverObj: bool = 0,
        // DMG only
        public dmgPaletteNumber: u1 = 0,
        // CGB only
        public cgbPaletteNumber: u3 = 0,
        public cgbVramBank: u1 = 0,

        // emulator use only
        public valid: boolean = false
    ) {}
}

const ATTRIB_DMG_PALETTE_NUM_IDX: u8 = 4;
const ATTRIB_CGB_PALETTE_NUM: u8 = 0b111;
const ATTRIB_CGB_VRAM_BANK_IDX: u8 = 3;
const ATTRIB_X_FLIP: u8 = 1 << 5;
const ATTRIB_Y_FLIP: u8 = 1 << 6;
const ATTRIB_BG_AND_WIN_OVER_OBJ: u8 = 1 << 7;

const NOT_TRANSFERRING: i16 = -3;
const SHOULD_TRANSFER: i16 = -2;
const TRANSFER_END: i16 = 160;

/**
 * The OAM (Object Attribute Memory) used to store sprite data. It is the same as RAM, but has
 * an extra method to more easily retrieve sprite data, and to do OAM DMA transfers.
 * @link https://gbdev.io/pandocs/OAM.html
 */
export class OAM implements Addressable {
    /**
     * There is a 2-cycle delay before any transfer.
     * -3 = not transferring
     * -2 = transfer starts in 2 cycles
     * -1 = transfer starts in 1 cycle
     * 0-159 = next byte to transfer
     */
    protected transferStep: i16 = NOT_TRANSFERRING;
    protected transferStart: SubRegister = new SubRegister(0xff);
    protected data: RAM = new RAM(160);

    protected spriteCache: StaticArray<Sprite> = new StaticArray<Sprite>(40);

    /** @link https://gbdev.io/pandocs/OAM_DMA_Transfer.html */
    tick(system: Addressable): void {
        // If we're transferring...
        if (this.transferStep >= 0) {
            const baseAddress = this.transferStart.get() << 8;

            // Copy a byte
            const transferredByte = system.read(baseAddress + this.transferStep);
            this.data.write(this.transferStep, transferredByte);
            this.spriteCache[this.transferStep >> 2].valid = false;
        }

        // Tick the transfer and the start delay
        if (this.transferStep !== NOT_TRANSFERRING) {
            this.transferStep++;
            // Transfer ended
            if (this.transferStep === TRANSFER_END) {
                this.transferStep = NOT_TRANSFERRING;
            }
        }
    }

    read(pos: u16): u8 {
        if (pos === 0xff46) return this.transferStart.get();
        if (0xfe00 <= pos && pos <= 0xfe9f) {
            if (this.transferStep >= 0) return 0xff; // read disabled
            return this.data.read(pos - 0xfe00);
        }
        throw new Error(`Invalid address for OAM: 0x${pos.toString(16)}`);
    }

    write(pos: u16, data: u8): void {
        if (pos === 0xff46) {
            this.transferStart.set(data);
            if (this.transferStep === NOT_TRANSFERRING || this.transferStep > 0)
                this.transferStep = SHOULD_TRANSFER;
        } else if (0xfe00 <= pos && pos <= 0xfe9f) {
            if (this.transferStep !== NOT_TRANSFERRING) return;
            const address = pos - 0xfe00;
            this.data.write(address, data);
            this.spriteCache[address >> 2].valid = false;
        }
    }

    getSprites(): StaticArray<Sprite> {
        for (let i: u16 = 0; i < this.spriteCache.length; i++) {
            const sprite = this.spriteCache[i];
            if (sprite.valid) continue;

            const address: u16 = i << 2;
            const attribs: u8 = this.data.read(address + 3);
            sprite.y = this.data.read(address + 0) - 16;
            sprite.x = this.data.read(address + 1) - 8;
            sprite.tileIndex = this.data.read(address + 2);
            sprite.xFlip = (attribs & ATTRIB_X_FLIP) !== 0;
            sprite.yFlip = (attribs & ATTRIB_Y_FLIP) !== 0;
            sprite.bgAndWinOverObj = (attribs & ATTRIB_BG_AND_WIN_OVER_OBJ) !== 0;
            sprite.dmgPaletteNumber = (attribs >> ATTRIB_DMG_PALETTE_NUM_IDX) & 1;
            sprite.cgbPaletteNumber = attribs & ATTRIB_CGB_PALETTE_NUM;
            sprite.cgbVramBank = (attribs >> ATTRIB_CGB_VRAM_BANK_IDX) & 1;
            sprite.valid = true;
        }
        return this.spriteCache;
    }
}
