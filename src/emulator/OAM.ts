import Addressable from "./Addressable";
import { RAM } from "./Memory";
import { SubRegister } from "./Register";
import System from "./System";

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

/**
 * The OAM (Object Attribute Memory) used to store sprite data. It is the same as RAM, but has
 * an extra method to more easily retrieve sprite data, and to do OAM DMA transfers.
 * @link https://gbdev.io/pandocs/OAM.html
 */
class OAM implements Addressable {
    /**
     * -1 = not transferring
     * 0-159 = next byte to transfer
     */
    protected transferStep: number = -1;
    protected transferStart = new SubRegister(0xff);
    protected data = new RAM(160);

    /** @link https://gbdev.io/pandocs/OAM_DMA_Transfer.html */
    tick(cycles: number, system: System) {
        // If we're transferring...
        if (this.transferStep !== -1) {
            const baseAddress = this.transferStart.get() * 0x100;
            const transferStart = this.transferStep;
            const transferEnd = Math.min(transferStart + cycles, 160);
            // Copy all bytes one by one (one byte per cycle)
            for (let step = transferStart; transferStart < transferEnd; step++) {
                const transferredByte = system.read(baseAddress + step);
                this.data.write(step, transferredByte);
            }
            // Update status
            this.transferStep = transferEnd === 160 ? -1 : transferEnd;
        }
    }

    protected toAddress(pos: number): [Addressable, number] {
        if (pos === 0xff46) return [this.transferStart, 0];
        if (0xfe00 <= pos && pos <= 0xfe9f) return [this.data, pos - 0xfe00];
        throw new Error(`Invalid address for OAM: 0x${pos.toString(16)}`);
    }

    read(pos: number): number {
        const [device, at] = this.toAddress(pos);
        return device.read(at);
    }

    write(pos: number, data: number): void {
        const [device, at] = this.toAddress(pos);
        device.write(at, data);
        if (pos === 0xff46) {
            this.transferStep = 0;
        }
    }

    getSprites(): Sprite[] {
        return [...new Array(40)].map((_, index) => {
            const address = index * 4; // 4 bytes per object
            const attribs = this.data.read(address + 3);
            return {
                x: this.data.read(address + 0),
                y: this.data.read(address + 1),
                tileIndex: this.data.read(address + 2),

                xFlip: (attribs & ATTRIB_X_FLIP) > 0,
                yFlip: (attribs & ATTRIB_Y_FLIP) > 0,
                paletteNumber: (attribs & ATTRIB_PALETTE_NUM) > 0,
                bgAndWinOverObj: (attribs & ATTRIB_BG_AND_WIN_OVER_OBJ) > 0,
            };
        });
    }
}

export default OAM;
