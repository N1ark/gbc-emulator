import { Addressable, RAM } from "../Memory";
import { Sprite } from "../OAM";
import { SubRegister, PaddedSubRegister } from "../Register";
import { combine, Int16Map, u1, u2, u3 } from "../util";

export type ColorPalette = StaticArray<u32>;

class ColorPaletteCacheEntry {
    constructor(public palette: ColorPalette, public valid: boolean) {}
}

// Palette flags
const PALETTE_AUTO_INCREMENT: u8 = 1 << 7;
const PALETTE_INDEX: u8 = 0b0011_1111;

abstract class ColorController implements Addressable {
    protected addresses: Int16Map<Addressable> = new Map<u16, Addressable>();
    abstract getBgPalette(id: u3): ColorPalette;
    abstract getObjPalette(sprite: Sprite): ColorPalette;

    read(pos: u16): u8 {
        const component = this.addresses.get(pos);
        if (!component) return 0xff;
        return component.read(pos);
    }

    write(pos: u16, value: u8): void {
        const component = this.addresses.get(pos);
        if (!component) return;
        component.write(pos, value);
    }
}

const DMGColorOptions: StaticArray<u32> = new StaticArray<u32>(4);
DMGColorOptions[0] = 0xffffffff; // white
DMGColorOptions[1] = 0xffaaaaaa; // light gray
DMGColorOptions[2] = 0xff555555; // dark gray
DMGColorOptions[3] = 0xff000000; // black

class DMGColorControl extends ColorController {
    // Background palette
    protected bgPalette: SubRegister = new SubRegister(0x00);
    // Object palettes
    protected objPalette0: SubRegister = new SubRegister(0x00);
    protected objPalette1: SubRegister = new SubRegister(0x00);

    constructor() {
        super();
        this.addresses.set(0xff47, this.bgPalette);
        this.addresses.set(0xff48, this.objPalette0);
        this.addresses.set(0xff49, this.objPalette1);
    }

    getBgPalette(): ColorPalette {
        const palette = this.bgPalette.get();
        const paletteArray = new StaticArray<u32>(4);
        paletteArray[0] = DMGColorOptions[(palette >> 0) & 0b11];
        paletteArray[1] = DMGColorOptions[(palette >> 2) & 0b11];
        paletteArray[2] = DMGColorOptions[(palette >> 4) & 0b11];
        paletteArray[3] = DMGColorOptions[(palette >> 6) & 0b11];
        return paletteArray;
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        const palette =
            sprite.dmgPaletteNumber === 0 ? this.objPalette0.get() : this.objPalette1.get();
        const paletteArray = new StaticArray<u32>(4);
        paletteArray[0] = 0x00000000; // transparent
        paletteArray[1] = DMGColorOptions[(palette >> 2) & 0b11];
        paletteArray[2] = DMGColorOptions[(palette >> 4) & 0b11];
        paletteArray[3] = DMGColorOptions[(palette >> 6) & 0b11];
        return paletteArray;
    }
}

class CGBColorControl extends ColorController {
    // Background palette
    protected bgPaletteOptions: SubRegister = new PaddedSubRegister(0b0100_0000);
    protected bgPaletteData: RAM = new RAM(64);
    // Object palettes
    protected objPaletteOptions: SubRegister = new PaddedSubRegister(0b0100_0000);
    protected objPaletteData: RAM = new RAM(64);
    // Palette cache
    protected paletteCache: StaticArray<ColorPaletteCacheEntry> = new StaticArray(16);

    constructor() {
        super();
        this.addresses.set(0xff47, new SubRegister());
        this.addresses.set(0xff48, new SubRegister());
        this.addresses.set(0xff49, new SubRegister());
        this.addresses.set(0xff68, this.bgPaletteOptions);
        this.addresses.set(0xff69, this.bgPaletteData);
        this.addresses.set(0xff6a, this.objPaletteOptions);
        this.addresses.set(0xff6b, this.objPaletteData);
    }

    override read(pos: number): number {
        if (pos === 0xff69)
            return this.bgPaletteData.read(this.bgPaletteOptions.get() & PALETTE_INDEX);

        if (pos === 0xff6b)
            return this.objPaletteData.read(this.objPaletteOptions.get() & PALETTE_INDEX);

        return super.read(pos);
    }

    override write(pos: number, value: number): void {
        if (pos === 0xff69) {
            const bgPaletteOptions = this.bgPaletteOptions.get();
            const index = bgPaletteOptions & PALETTE_INDEX;
            this.bgPaletteData.write(index, value);
            this.paletteCache[index >> 3].valid = false;
            if (bgPaletteOptions & PALETTE_AUTO_INCREMENT)
                this.bgPaletteOptions.set(
                    (bgPaletteOptions & ~PALETTE_INDEX) | ((index + 1) & PALETTE_INDEX)
                );
        } else if (pos === 0xff6b) {
            const objPaletteOptions = this.objPaletteOptions.get();
            const index = objPaletteOptions & PALETTE_INDEX;
            this.objPaletteData.write(index, value);
            this.paletteCache[(index >> 3) + 8].valid = false;
            if (objPaletteOptions & PALETTE_AUTO_INCREMENT)
                this.objPaletteOptions.set(
                    (objPaletteOptions & ~PALETTE_INDEX) | ((index + 1) & PALETTE_INDEX)
                );
        } else {
            super.write(pos, value);
        }
    }

    protected decodePalette(data: RAM, id: u3, offset: u1, cacheOffset: u8): ColorPalette {
        const palette = this.paletteCache[id + cacheOffset];
        if (palette.valid) return palette.palette;

        for (let colorIdx = offset; colorIdx < 4; colorIdx++) {
            const colorLow: u8 = data.read(id * 8 + colorIdx * 2);
            const colorHigh: u8 = data.read(id * 8 + colorIdx * 2 + 1);
            const fullColor: u16 = combine(colorHigh, colorLow);

            const red5: u16 = (fullColor >> 0) & 0b0001_1111;
            const green5: u16 = (fullColor >> 5) & 0b0001_1111;
            const blue5: u16 = (fullColor >> 10) & 0b0001_1111;

            const red8: u16 = (red5 << 3) | (red5 >> 2);
            const green8: u16 = (green5 << 3) | (green5 >> 2);
            const blue8: u16 = (blue5 << 3) | (blue5 >> 2);

            palette.palette[colorIdx] =
                ((<u32>0xff) << 24) | ((<u32>blue8) << 16) | ((<u32>green8) << 8) | (<u32>red8);
        }
        palette.valid = true;

        return palette.palette;
    }

    getBgPalette(id: u3): ColorPalette {
        return this.decodePalette(this.bgPaletteData, id, 0, 0);
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        return this.decodePalette(this.objPaletteData, sprite.cgbPaletteNumber, 1, 8);
    }
}

export { ColorController, DMGColorControl, CGBColorControl };
