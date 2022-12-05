import Addressable from "./Addressable";
import MBC from "./mbc/abstract";
import MBC1 from "./mbc/mbc1";
import NoMBC from "./mbc/nombc";

const TITLE_START = 0x134;
const TITLE_END = 0x143;
const CARTRIDGE_TYPE = 0x147;

/**
 * The ROM of the game boy, containing the cartridge data. This class is a wrapper around the
 * different Memory Bank Controllers (MBCs), and is responsible for choosing the right MCB and
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
        switch (mbcType) {
            case 0x00:
                this.mbc = new NoMBC(data);
                break;
            case 0x01:
                this.mbc = new MBC1(data, { hasRam: false });
            case 0x02:
                this.mbc = new MBC1(data, { hasRam: true });
            case 0x03:
                this.mbc = new MBC1(data, { hasRam: true });
                break;
            default:
                throw new Error(`[ROM] Invalid cartridge type: ${mbcType?.toString(16)}`);
        }
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
