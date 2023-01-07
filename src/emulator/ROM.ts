import MBC from "./mbc/abstract";
import MBC1 from "./mbc/mbc1";
import MBC3 from "./mbc/mbc3";
import NoMBC from "./mbc/nombc";
import { Addressable } from "./Memory";

const TITLE_START = 0x134;
const TITLE_END = 0x143;
const CARTRIDGE_TYPE = 0x147;

/**
 * The ROM of the game boy, containing the cartridge data. This class is a wrapper around the
 * different Memory Bank Controllers (MBCs), and is responsible for choosing the right MBC and
 * parsing some of the meta data from the cartridge header.
 * @link https://gbdev.io/pandocs/MBCs.html
 * @link https://gbdev.io/pandocs/The_Cartridge_Header.html
 */
class ROM implements Addressable {
    protected mbc: MBC;
    protected title: string;

    constructor(data: Uint8Array) {
        this.title = [...new Array(TITLE_END - TITLE_START)]
            .map((_, i) => String.fromCharCode(data[TITLE_START + i]))
            .reduce((prev, x) => prev + x, "")
            .replaceAll("\u0000", "");

        const mbcType = data[CARTRIDGE_TYPE];
        const mbcInstance = {
            // No MBC
            0x00: () => new NoMBC(data),
            // MBC1
            0x01: () => new MBC1(data, { hasRam: false }),
            0x02: () => new MBC1(data, { hasRam: true }),
            0x03: () => new MBC1(data, { hasRam: true }),
            // MBC3
            0x0f: () => new MBC3(data, { hasTimer: true, hasRam: false }),
            0x10: () => new MBC3(data, { hasTimer: true, hasRam: true }),
            0x11: () => new MBC3(data, { hasTimer: false, hasRam: false }),
            0x12: () => new MBC3(data, { hasTimer: false, hasRam: true }),
            0x13: () => new MBC3(data, { hasTimer: false, hasRam: true }),
        }[mbcType];
        if (mbcInstance === undefined)
            throw new Error(`[ROM] Invalid cartridge type: ${mbcType?.toString(16)}`);
        this.mbc = mbcInstance();
        console.debug(`(ROM) Saved data for game "${this.title}": `, data);
    }

    write(pos: number, data: number): void {
        this.mbc.write(pos, data);
    }

    read(pos: number): number {
        return this.mbc.read(pos);
    }
}

export default ROM;
