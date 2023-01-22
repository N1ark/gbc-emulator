import MBC from "./mbc/abstract";
import MBC1 from "./mbc/mbc1";
import MBC3 from "./mbc/mbc3";
import MBC5 from "./mbc/mbc5";
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

    protected static mbcFromType(type: u8, data: StaticArray<u8>): MBC {
        switch (type) {
            // No MBC
            case 0x00:
                return new NoMBC(data);

            // MBC1
            case 0x01:
                return new MBC1(data, false);
            case 0x02:
                return new MBC1(data, true);
            case 0x03:
                return new MBC1(data, true);

            // MBC3
            case 0x0f:
                return new MBC3(data, true, false);
            case 0x10:
                return new MBC3(data, true, true);
            case 0x11:
                return new MBC3(data, false, false);
            case 0x12:
                return new MBC3(data, false, true);
            case 0x13:
                return new MBC3(data, false, true);

            // MBC5
            case 0x19:
                return new MBC5(data, false, false);
            case 0x1a:
                return new MBC5(data, true, false);
            case 0x1b:
                return new MBC5(data, true, false);
            case 0x1c:
                return new MBC5(data, false, true);
            case 0x1d:
                return new MBC5(data, true, true);
            case 0x1e:
                return new MBC5(data, true, true);

            default:
                throw new Error(`[ROM] Invalid cartridge type: ${type.toString(16)}`);
        }
    }

    constructor(data: StaticArray<u8>) {
        this.title = [...new Array(TITLE_END - TITLE_START)]
            .map((_, i) => String.fromCharCode(data[TITLE_START + i]))
            .reduce((prev, x) => prev + x, "")
            .replaceAll("\u0000", "");

        const mbcType = data[CARTRIDGE_TYPE];
        this.mbc = ROM.mbcFromType(mbcType, data);
        console.debug(`(ROM) Saved data for game "${this.title}": ${data}`);
    }

    write(pos: number, data: number): void {
        this.mbc.write(pos, data);
    }

    read(pos: number): number {
        return this.mbc.read(pos);
    }
}

export default ROM;
