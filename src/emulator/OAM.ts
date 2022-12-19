import Addressable from "./Addressable";
import { RAM } from "./Memory";
import { SubRegister } from "./Register";
import System from "./System";
import { wrap8 } from "./util";

export type Sprite = {
    x: number;
    y: number;
    tileIndex: number;
    // From attributes:
    paletteNumber: boolean;
    xFlip: boolean;
    yFlip: boolean;
    bgAndWinOverObj: boolean;
};

const ATTRIB_PALETTE_NUM = 1 << 4;
const ATTRIB_X_FLIP = 1 << 5;
const ATTRIB_Y_FLIP = 1 << 6;
const ATTRIB_BG_AND_WIN_OVER_OBJ = 1 << 7;

const NOT_TRANSFERRING = -3;
const SHOULD_TRANSFER = -2;
const TRANSFER_END = 160;

/**
 * The OAM (Object Attribute Memory) used to store sprite data. It is the same as RAM, but has
 * an extra method to more easily retrieve sprite data, and to do OAM DMA transfers.
 * @link https://gbdev.io/pandocs/OAM.html
 */
class OAM implements Addressable {
    /**
     * There is a 2-cycle delay before any transfer.
     * -3 = not transferring
     * -2 = transfer starts in 2 cycles
     * -1 = transfer starts in 1 cycle
     * 0-159 = next byte to transfer
     */
    protected transferStep: number = NOT_TRANSFERRING;
    protected transferStart = new SubRegister(0xff);
    protected data = new RAM(160);

    /** @link https://gbdev.io/pandocs/OAM_DMA_Transfer.html */
    tick(system: System) {
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

    read(pos: number): number {
        if (pos === 0xff46) return this.transferStart.get();
        if (0xfe00 <= pos && pos <= 0xfe9f) {
            if (this.transferStep >= 0) return 0xff; // read disabled
            return this.data.read(pos - 0xfe00);
        }
        throw new Error(`Invalid address for OAM: 0x${pos.toString(16)}`);
    }

    write(pos: number, data: number): void {
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

    protected spriteCache: (Sprite & { valid: boolean })[] = [...new Array(40)].map(() => ({
        y: 0,
        x: 0,
        tileIndex: 0,
        xFlip: false,
        yFlip: false,
        paletteNumber: false,
        bgAndWinOverObj: false,
        valid: false,
    }));

    getSprites(): Readonly<Sprite>[] {
        this.spriteCache.forEach((sprite, index) => {
            if (!sprite.valid) {
                const address = index << 2;
                const attribs = this.data.read(address + 3);
                sprite.y = wrap8(this.data.read(address + 0) - 16);
                sprite.x = wrap8(this.data.read(address + 1) - 8);
                sprite.tileIndex = this.data.read(address + 2);
                sprite.xFlip = (attribs & ATTRIB_X_FLIP) !== 0;
                sprite.yFlip = (attribs & ATTRIB_Y_FLIP) !== 0;
                sprite.paletteNumber = (attribs & ATTRIB_PALETTE_NUM) !== 0;
                sprite.bgAndWinOverObj = (attribs & ATTRIB_BG_AND_WIN_OVER_OBJ) !== 0;
                sprite.valid = true;
            }
        });
        return this.spriteCache;
    }
}

export default OAM;
