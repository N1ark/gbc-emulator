import Addressable from "./Addressable";
import { HRAM_SIZE, WRAM_SIZE } from "./constants";
import GameInput from "./GameInput";
import JoypadInput from "./JoypadInput";
import { RAM, ROM } from "./Memory";

type AddressData = [Addressable, number];

class System implements Addressable {
    protected rom: ROM;
    protected gpu: RAM = new RAM(0);
    protected wram: RAM = new RAM(WRAM_SIZE);
    protected hram: RAM = new RAM(HRAM_SIZE);

    protected joypad: JoypadInput;

    constructor(rom: string, input: GameInput) {
        this.rom = new ROM(rom);
        this.joypad = new JoypadInput(input);
    }

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): AddressData {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Registers
        if (pos === 0xff00) return [this.joypad, 0];

        // ROM Bank
        if (0x0000 <= pos && pos <= 0x7fff) return [this.rom, pos];
        // Work RAM (WRAM)
        if (0xc000 <= pos && pos <= 0xdfff) return [this.wram, pos - 0xc000];
        // High RAM (HRAM)
        if (0xff80 <= pos && pos <= 0xfffe) return [this.hram, pos - 0xff80];

        throw new Error(`Read from currently unsupported address ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const [component, address] = this.getAddress(pos);
        return component.read(address);
    }

    write(pos: number, data: number): void {
        const [component, address] = this.getAddress(pos);
        component.write(address, data);
    }

    readInput() {
        this.joypad.readInput();
    }
}

export default System;
