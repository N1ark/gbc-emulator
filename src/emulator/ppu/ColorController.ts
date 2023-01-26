import { CGBMode } from "../constants";
import { Addressable, RAM } from "../Memory";
import { Sprite } from "../OAM";
import { Register, MaskRegister } from "../Register";
import { Int2, Int3 } from "../util";

export type ColorPalette = [number, number, number, number];

// Palette flags
const PALETTE_AUTO_INCREMENT = 1 << 7;
const PALETTE_INDEX = 0b0011_1111;

abstract class ColorController implements Addressable {
    protected abstract readonly addresses: Record<number, Addressable>;
    abstract getBgPalette(id: Int3): ColorPalette;
    abstract getObjPalette(sprite: Sprite): ColorPalette;

    changeCBGMode(mode: CGBMode): void {}

    read(pos: number): number {
        const component = this.addresses[pos];
        if (!component) return 0xff;
        return component.read(pos);
    }

    write(pos: number, value: number): void {
        const component = this.addresses[pos];
        if (!component) return;
        component.write(pos, value);
    }
}

class DMGColorControl extends ColorController {
    static readonly colorOptions = [
        0xffffffff, // white
        0xffaaaaaa, // light gray
        0xff555555, // dark gray
        0xff000000, // black
    ];

    // Background palette
    protected bgPalette = new Register(0x00);
    // Object palettes
    protected objPalette0 = new Register(0x00);
    protected objPalette1 = new Register(0x00);

    protected addresses = {
        0xff47: this.bgPalette,
        0xff48: this.objPalette0,
        0xff49: this.objPalette1,
    };

    getBgPalette(): ColorPalette {
        const palette = this.bgPalette.get();
        return [
            DMGColorControl.colorOptions[(palette >> 0) & 0b11],
            DMGColorControl.colorOptions[(palette >> 2) & 0b11],
            DMGColorControl.colorOptions[(palette >> 4) & 0b11],
            DMGColorControl.colorOptions[(palette >> 6) & 0b11],
        ];
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        const palette =
            sprite.dmgPaletteNumber === 0 ? this.objPalette0.get() : this.objPalette1.get();
        return [
            0x00000000, // unused, color 0b00 is transparent
            DMGColorControl.colorOptions[(palette >> 2) & 0b11],
            DMGColorControl.colorOptions[(palette >> 4) & 0b11],
            DMGColorControl.colorOptions[(palette >> 6) & 0b11],
        ];
    }
}

class CGBColorControl extends ColorController {
    // Background palette
    protected bgPaletteOptions = new MaskRegister(0b0100_0000);
    protected bgPaletteData = new RAM(64);
    // Object palettes
    protected objPaletteOptions = new MaskRegister(0b0100_0000);
    protected objPaletteData = new RAM(64);
    // Palette cache
    protected paletteCache: { data: ColorPalette; valid: boolean }[] = [...Array(16)].map(
        () => ({
            data: [0, 0, 0, 0],
            valid: false,
        })
    );
    // Compatibility mode
    protected dmgBgPalette = new Register(0x00);
    protected dmgObj0Palette = new Register(0x00);
    protected dmgObj1Palette = new Register(0x00);
    protected dmgMode = false;

    protected addresses = {
        0xff68: this.bgPaletteOptions,
        0xff69: this.bgPaletteData,
        0xff6a: this.objPaletteOptions,
        0xff6b: this.objPaletteData,

        0xff47: this.dmgBgPalette, // Unused
        0xff48: this.dmgObj0Palette, // Unused
        0xff49: this.dmgObj1Palette, // Unused
    };

    changeCBGMode(mode: CGBMode): void {
        this.dmgMode = mode !== CGBMode.CGB;
        this.paletteCache.forEach((x) => (x.valid = false)); // force-reload color 0 for objects
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

    protected decodePalette(data: RAM, id: Int3, offset: 0 | 1, cacheOffset: 0 | 8) {
        const palette = this.paletteCache[id + cacheOffset];
        if (palette.valid) return palette.data;

        for (let colorIdx = offset; colorIdx < 4; colorIdx++) {
            const colorLow = data.read(id * 8 + colorIdx * 2);
            const colorHigh = data.read(id * 8 + colorIdx * 2 + 1);
            const fullColor = (colorHigh << 8) | colorLow;

            const red5 = (fullColor >> 0) & 0b0001_1111;
            const green5 = (fullColor >> 5) & 0b0001_1111;
            const blue5 = (fullColor >> 10) & 0b0001_1111;

            const red8 = (red5 << 3) | (red5 >> 2);
            const green8 = (green5 << 3) | (green5 >> 2);
            const blue8 = (blue5 << 3) | (blue5 >> 2);

            palette.data[colorIdx] = (0xff << 24) | (blue8 << 16) | (green8 << 8) | red8;
        }
        palette.valid = true;

        return palette.data;
    }

    protected applyDmgTransform(
        palette: ColorPalette,
        register: Register,
        isObj: boolean
    ): ColorPalette {
        const dmgPalette = register.get();
        return [
            isObj ? 0 : palette[(dmgPalette >> 0) & 0b11],
            palette[(dmgPalette >> 2) & 0b11],
            palette[(dmgPalette >> 4) & 0b11],
            palette[(dmgPalette >> 6) & 0b11],
        ];
    }

    getBgPalette(id: Int3): ColorPalette {
        if (!this.dmgMode) return this.decodePalette(this.bgPaletteData, id, 0, 0);

        const palette = this.decodePalette(this.bgPaletteData, 0, 0, 0);
        const dmgPalette = this.applyDmgTransform(palette, this.dmgBgPalette, false);
        return dmgPalette;
    }

    getObjPalette(sprite: Sprite): ColorPalette {
        if (!this.dmgMode)
            return this.decodePalette(this.objPaletteData, sprite.cgbPaletteNumber, 1, 8);

        const palette = this.decodePalette(this.objPaletteData, sprite.dmgPaletteNumber, 0, 8);
        const dmgPalette = this.applyDmgTransform(
            palette,
            sprite.dmgPaletteNumber ? this.dmgObj1Palette : this.dmgObj0Palette,
            true
        );
        return dmgPalette;
    }
}

export { ColorController, DMGColorControl, CGBColorControl };
