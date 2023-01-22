import MBC from "./abstract";

class NoMBC extends MBC {
    read(pos: number): number {
        if (0xa000 <= pos && pos <= 0xbfff) return 0xff; // eram
        return this.data[pos];
    }

    write(pos: number, data: number): void {
        // nothing is writable by default
    }
}

export default NoMBC;
