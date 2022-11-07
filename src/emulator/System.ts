import { HRAM_SIZE, WRAM_SIZE } from "./constants";
import { RAM, ROM } from "./Memory";

class System {
    protected rom: ROM;
    protected gpu: RAM = new RAM(0);
    protected wram: RAM = new RAM(WRAM_SIZE);
    protected hram: RAM = new RAM(HRAM_SIZE);

    constructor(rom: string) {
        this.rom = new ROM(rom);
    }

    read(pos: number) {
        return 1;
    }
}

export default System;
