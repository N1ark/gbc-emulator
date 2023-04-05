import MBC from "./MBC";

class NoMBC extends MBC {
    constructor(data: Uint8Array) {
        super(data, false);
    }

    read(pos: number): number {
        if (0xa000 <= pos && pos <= 0xbfff) return 0xff; // eram
        return this.rom.read(pos);
    }

    write(pos: number, data: number): void {
        // nothing is writable by default
    }
}

export default NoMBC;
