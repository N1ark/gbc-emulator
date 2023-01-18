import { Addressable, CircularRAM } from "../Memory";
import { PaddedSubRegister } from "../Register";
import { Int2 } from "../util";

type TileCache = Record<number, { valid: boolean; data: Int2[][] }>;

abstract class VRAMController implements Addressable {
    protected abstract readonly addresses: Record<number, Addressable>;
    protected abstract get currentBank(): Addressable;
    protected abstract get currentCache(): TileCache;

    protected static makeCache(): TileCache {
        return [...new Array(0x180)].map(() => ({
            valid: false,
            data: Array.from(Array(8), () => new Array(8)),
        }));
    }

    protected _getTile(tileAddress: number, bank: Addressable, cache: TileCache): Int2[][] {
        const cachedTile = cache[(tileAddress >> 4) & 0x1ff];
        if (!cachedTile.valid) {
            // Draw the 8 lines of the tile
            for (let tileY = 0; tileY < 8; tileY++) {
                const tileDataH = bank.read(tileAddress + tileY * 2);
                const tileDataL = bank.read(tileAddress + tileY * 2 + 1);
                for (let tileX = 0; tileX < 8; tileX++) {
                    const shadeL = (tileDataH >> (7 - tileX)) & 0b1;
                    const shadeH = (tileDataL >> (7 - tileX)) & 0b1;
                    const shade = ((shadeH << 1) | shadeL) as Int2;
                    cachedTile.data[tileX][tileY] = shade;
                }
            }
            cachedTile.valid = true;
        }
        return cachedTile.data;
    }

    abstract getTile(tileAddress: number, bankId: 0 | 1): Int2[][];

    abstract readBank0(pos: number): number;
    abstract readBank1(pos: number): number;

    read(pos: number): number {
        if (0x8000 <= pos && pos <= 0x9fff) return this.currentBank.read(pos);
        const component = this.addresses[pos];
        if (component) return component.read(pos);
        return 0xff;
    }

    write(address: number, value: number): void {
        if (0x8000 <= address && address <= 0x9fff) {
            if (
                // if in tile memory, dirty tile
                0x8000 <= address &&
                address < 0x9800 &&
                value !== this.currentBank.read(address)
            ) {
                this.currentCache[(address >> 4) & 0x1ff].valid = false;
            }
            return this.currentBank.write(address, value);
        }
        const component = this.addresses[address];
        if (component) return component.write(address, value);
    }
}

class DMGVRAMController extends VRAMController {
    protected vram = new CircularRAM(8192, 0x8000);
    protected tileCache = VRAMController.makeCache();
    protected currentBank = this.vram;
    protected currentCache = this.tileCache;
    protected readonly addresses: Record<number, Addressable> = {};

    readBank0(pos: number): number {
        return this.vram.read(pos);
    }
    readBank1(pos: number): number {
        return 0;
    }

    getTile(tileAddress: number): Int2[][] {
        return this._getTile(tileAddress, this.vram, this.tileCache);
    }
}

class CGBVRAMController extends VRAMController {
    protected vram0 = new CircularRAM(8192, 0x8000);
    protected vram1 = new CircularRAM(8192, 0x8000);
    protected tileCache0 = VRAMController.makeCache();
    protected tileCache1 = VRAMController.makeCache();
    protected vramBank = new PaddedSubRegister(0b1111_1110);

    protected get currentBank() {
        return this.vramBank.get() & 0b1 ? this.vram1 : this.vram0;
    }
    protected get currentCache() {
        return this.vramBank.get() & 0b1 ? this.tileCache1 : this.tileCache0;
    }

    protected readonly addresses: Record<number, Addressable> = {
        0xff4f: this.vramBank,
    };

    readBank0(pos: number): number {
        return this.vram0.read(pos);
    }

    readBank1(pos: number): number {
        return this.vram1.read(pos);
    }

    getTile(tileAddress: number, bank: 0 | 1): Int2[][] {
        return this._getTile(
            tileAddress,
            bank ? this.vram1 : this.vram0,
            bank ? this.tileCache1 : this.tileCache0
        );
    }
}

export { VRAMController, DMGVRAMController, CGBVRAMController };
