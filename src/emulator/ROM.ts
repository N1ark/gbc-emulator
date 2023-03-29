import MBC from "./mbc/abstract";
import MBC1 from "./mbc/mbc1";
import MBC2 from "./mbc/mbc2";
import MBC3 from "./mbc/mbc3";
import MBC5 from "./mbc/mbc5";
import NoMBC from "./mbc/nombc";
import { Addressable } from "./Memory";

const TITLE_START = 0x134;
const TITLE_END = 0x143;

const IDENTIFIER_START = 0x134;
const IDENTIFIER_END = 0x14f;

const CARTRIDGE_TYPE = 0x147;

/**
 * The ROM of the game boy, containing the cartridge data. This class is a wrapper around the
 * different Memory Bank Controllers (MBCs), and is responsible for choosing the right MBC and
 * parsing some of the meta data from the cartridge header.
 * @link https://gbdev.io/pandocs/MBCs.html
 * @link https://gbdev.io/pandocs/The_Cartridge_Header.html
 */
class ROM implements Addressable {
    /** The MBC to handle addressing etc. */
    protected mbc: MBC;

    /** The ROM's title (included from 0x134 to 0x143), in ASCII uppercase. */
    protected title: string;

    /**
     * The identifier includes the title and extra header data, to properly identify the ROM.
     * The title can't be used alone, as multiple ROMs can have the same title.
     */
    protected identifier: string;

    constructor(data: Uint8Array) {
        this.title = [...new Array(TITLE_END - TITLE_START)]
            .map((_, i) => String.fromCharCode(data[TITLE_START + i]))
            .reduce((prev, x) => prev + x, "")
            .replaceAll("\u0000", "");

        this.identifier = [...new Array(IDENTIFIER_END - IDENTIFIER_START)]
            .map((_, i) => String.fromCharCode(data[IDENTIFIER_START + i]))
            .reduce((prev, x) => prev + x, "");

        const mbcType = data[CARTRIDGE_TYPE];
        const mbcInstance = {
            // No MBC
            0x00: () => new NoMBC(data),
            // MBC1
            0x01: () => new MBC1(data, { hasRam: false, hasBattery: false }),
            0x02: () => new MBC1(data, { hasRam: true, hasBattery: false }),
            0x03: () => new MBC1(data, { hasRam: true, hasBattery: true }),
            // MBC2
            0x05: () => new MBC2(data, { hasBattery: false }),
            0x06: () => new MBC2(data, { hasBattery: true }),
            // MBC3
            0x0f: () => new MBC3(data, { hasTimer: true, hasRam: false, hasBattery: true }),
            0x10: () => new MBC3(data, { hasTimer: true, hasRam: true, hasBattery: true }),
            0x11: () => new MBC3(data, { hasTimer: false, hasRam: false, hasBattery: false }),
            0x12: () => new MBC3(data, { hasTimer: false, hasRam: true, hasBattery: false }),
            0x13: () => new MBC3(data, { hasTimer: false, hasRam: true, hasBattery: true }),
            // MBC5
            0x19: () => new MBC5(data, { hasRam: false, hasRumble: false, hasBattery: false }),
            0x1a: () => new MBC5(data, { hasRam: true, hasRumble: false, hasBattery: false }),
            0x1b: () => new MBC5(data, { hasRam: true, hasRumble: false, hasBattery: true }),
            0x1c: () => new MBC5(data, { hasRam: false, hasRumble: true, hasBattery: false }),
            0x1d: () => new MBC5(data, { hasRam: true, hasRumble: true, hasBattery: false }),
            0x1e: () => new MBC5(data, { hasRam: true, hasRumble: true, hasBattery: true }),
        }[mbcType];
        if (mbcInstance === undefined)
            throw new Error(`[ROM] Invalid cartridge type: ${mbcType.toString(16)}`);
        this.mbc = mbcInstance();
        console.debug(`(ROM) Saved data for game "${this.title}": `, data);
    }

    write(pos: number, data: number): void {
        this.mbc.write(pos, data);
    }

    read(pos: number): number {
        return this.mbc.read(pos);
    }

    getTitle(): string {
        return this.title;
    }

    getIdentifier(): string {
        return this.identifier;
    }

    supportsSaves(): boolean {
        return this.mbc.supportsSaves();
    }

    save(): Uint8Array | null {
        return this.mbc.save();
    }

    load(data: Uint8Array): void {
        this.mbc.load(data);
    }
}

export default ROM;
