import { Addressable, CircularRAM, RAM } from "../Memory";
import { PaddedSubRegister, SubRegister } from "../Register";
import { combine, Int16Map, u1, u2 } from "../util";

type TileData = StaticArray<StaticArray<u2>>;

class TileCacheEntry {
    constructor(public valid: boolean, public data: TileData) {}
}

type TileCache = StaticArray<TileCacheEntry>;

const HDMA5_LENGTH: u8 = 0b0111_1111;
const HDMA5_MODE: u8 = 0b1000_0000;

abstract class VRAMController implements Addressable {
    protected abstract get currentBank(): Addressable;
    protected abstract get currentCache(): TileCache;
    protected addresses: Int16Map<Addressable> = new Map<u16, Addressable>();

    protected static makeCache(): TileCache {
        const cache = new StaticArray<TileCacheEntry>(0x180);
        for (let i: u16 = 0; i < 0x180; i++) {
            const cacheData = new StaticArray<StaticArray<u2>>(8);
            for (let j: u8 = 0; j < 8; j++) {
                cacheData[j] = new StaticArray<u2>(8);
            }
            cache[i] = new TileCacheEntry(false, cacheData);
        }
        return cache;
    }

    protected _getTile(tileAddress: u16, bank: Addressable, cache: TileCache): TileData {
        const cachedTile = cache[(tileAddress >> 4) & 0x1ff];
        if (!cachedTile.valid) {
            // Draw the 8 lines of the tile
            for (let tileY: u8 = 0; tileY < 8; tileY++) {
                const tileDataH: u8 = bank.read(tileAddress + tileY * 2);
                const tileDataL: u8 = bank.read(tileAddress + tileY * 2 + 1);
                for (let tileX: u8 = 0; tileX < 8; tileX++) {
                    const shadeL: u1 = (tileDataH >> (7 - tileX)) & 0b1;
                    const shadeH: u1 = (tileDataL >> (7 - tileX)) & 0b1;
                    const shade: u2 = (shadeH << 1) | shadeL;
                    cachedTile.data[tileX][tileY] = shade;
                }
            }
            cachedTile.valid = true;
        }
        return cachedTile.data;
    }

    abstract getTile(tileAddress: number, bankId: u1): TileData;

    abstract readBank0(pos: u16): u8;
    abstract readBank1(pos: u16): u8;

    /**
     * Ticks the VRAM. This does nothing on DMG, but ticks the VRAM-DMA on CGB.
     * @param system The system of the Gameboy. Used for the DMA.
     * @param isInHblank If the PPU is in a HBlank and LY=0-143.
     * @returns If the CPU should be halted (because a DMA is in progress)
     */
    tick(system: Addressable, isInHblank: boolean): boolean {
        return false;
    }

    read(pos: u16): u8 {
        if (0x8000 <= pos && pos <= 0x9fff) return this.currentBank.read(pos);
        const component = this.addresses.get(pos);
        if (component) return component.read(pos);
        return 0xff;
    }

    write(address: u16, value: u8): void {
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
        const component = this.addresses.get(address);
        if (component) component.write(address, value);
    }
}

class DMGVRAMController extends VRAMController {
    protected vram: RAM = new CircularRAM(8192, 0x8000);
    protected tileCache: TileCache = VRAMController.makeCache();
    protected get currentBank(): Addressable {
        return this.vram;
    }
    protected get currentCache(): TileCache {
        return this.tileCache;
    }

    readBank0(pos: u16): u8 {
        return this.vram.read(pos);
    }
    readBank1(pos: u16): u8 {
        return 0;
    }

    getTile(tileAddress: u16): TileData {
        return this._getTile(tileAddress, this.vram, this.tileCache);
    }
}

enum DMAState {
    IDLE, // No DMA in progress
    HBLANK, // HBlank DMA
    GENERAL, // General-purpose DMA
}

class CGBVRAMController extends VRAMController {
    protected vram0: RAM = new CircularRAM(8192, 0x8000);
    protected vram1: RAM = new CircularRAM(8192, 0x8000);
    protected tileCache0: TileCache = VRAMController.makeCache();
    protected tileCache1: TileCache = VRAMController.makeCache();
    protected vramBank: SubRegister = new PaddedSubRegister(0b1111_1110);

    protected dmaInProgress: DMAState = DMAState.IDLE;
    protected dmaIndex: u16 = 0;
    protected dmaToTransfer: u16 = 0;

    protected hdma1: SubRegister = new SubRegister();
    protected hdma2: SubRegister = new SubRegister();
    protected hdma3: SubRegister = new SubRegister();
    protected hdma4: SubRegister = new SubRegister();
    protected hdma5: SubRegister = new SubRegister();

    protected get currentBank(): Addressable {
        return this.vramBank.get() & 0b1 ? this.vram1 : this.vram0;
    }
    protected get currentCache(): TileCache {
        return this.vramBank.get() & 0b1 ? this.tileCache1 : this.tileCache0;
    }

    constructor() {
        super();
        this.addresses.set(0xff4f, this.vramBank);
        this.addresses.set(0xff51, this.hdma1);
        this.addresses.set(0xff52, this.hdma2);
        this.addresses.set(0xff53, this.hdma3);
        this.addresses.set(0xff54, this.hdma4);
        this.addresses.set(0xff55, this.hdma5);
    }

    override tick(system: Addressable, isInHblank: boolean): boolean {
        if (
            (this.dmaInProgress === DMAState.HBLANK && isInHblank) ||
            this.dmaInProgress === DMAState.GENERAL
        ) {
            const source: u16 = combine(this.hdma1.get(), this.hdma2.get()) & 0xfff0;
            const dest: u16 = combine(this.hdma3.get(), this.hdma4.get()) & 0x1ff0;

            const byte1: u8 = system.read(source + this.dmaIndex);
            const byte2: u8 = system.read(source + this.dmaIndex + 1);
            this.write(0x8000 + dest + this.dmaIndex, byte1);
            this.write(0x8000 + dest + this.dmaIndex + 1, byte2);

            this.dmaIndex += 2;
            this.dmaToTransfer -= 2;
            this.hdma5.set((<u8>(this.dmaToTransfer >> 4)) & HDMA5_LENGTH);

            if (this.dmaToTransfer === 0) {
                this.dmaInProgress = DMAState.IDLE;
            }

            return true;
        }
        return false;
    }

    override write(address: u16, value: u8): void {
        super.write(address, value);

        if (address === 0xff55) {
            // Interrupts the transfer
            if (this.dmaInProgress !== DMAState.IDLE) {
                if (value & HDMA5_MODE) {
                    this.dmaInProgress = DMAState.IDLE;
                }
            }

            // Starts the transfer
            else {
                const length: u16 = (<u16>(value & HDMA5_LENGTH) + 1) << 4;
                this.dmaInProgress = value & HDMA5_MODE ? DMAState.HBLANK : DMAState.GENERAL;
                this.dmaToTransfer = length;
                this.dmaIndex = 0;
            }
        }
    }

    override read(pos: u16): u8 {
        if (pos === 0xff55) {
            const hdma5 = this.hdma5.get();
            return (
                (hdma5 & HDMA5_LENGTH) | (this.dmaInProgress === DMAState.IDLE ? HDMA5_MODE : 0)
            );
        }

        return super.read(pos);
    }

    readBank0(pos: u16): u8 {
        return this.vram0.read(pos);
    }

    readBank1(pos: u16): u8 {
        return this.vram1.read(pos);
    }

    getTile(tileAddress: u16, bank: u1): TileData {
        return this._getTile(
            tileAddress,
            bank ? this.vram1 : this.vram0,
            bank ? this.tileCache1 : this.tileCache0
        );
    }
}

export { VRAMController, DMGVRAMController, CGBVRAMController };
