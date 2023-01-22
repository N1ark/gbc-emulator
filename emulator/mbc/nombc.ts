import MBC from "./abstract";

class NoMBC extends MBC {
    read(pos: u16): u8 {
        if (0xa000 <= pos && pos <= 0xbfff) return 0xff; // eram
        return this.data[pos];
    }

    write(pos: u16, data: u8): void {
        // nothing is writable by default
    }
}

export default NoMBC;
