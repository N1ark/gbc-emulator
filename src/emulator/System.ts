import Addressable from "./Addressable";
import {
    HRAM_SIZE,
    IFLAG_JOYPAD,
    IFLAG_LCDC,
    IFLAG_SERIAL,
    IFLAG_TIMER,
    IFLAG_VBLANK,
    WRAM_SIZE,
} from "./constants";
import GameInput from "./GameInput";
import JoypadInput from "./JoypadInput";
import { RAM, ROM } from "./Memory";
import { SubRegister } from "./Register";

type AddressData = [Addressable, number];

class System implements Addressable {
    protected rom: ROM;
    protected gpu: RAM = new RAM(0);
    protected wram: RAM = new RAM(WRAM_SIZE);
    protected hram: RAM = new RAM(HRAM_SIZE);

    protected intMasterEnable: boolean = false; // IME - master enable flag
    protected intEnable = new SubRegister(0x00); // IE - interrupt enable (handler)
    protected intFlag = new SubRegister(0xe1); // IF - interrupt flag (requests)

    protected joypad: JoypadInput;

    constructor(rom: string, input: GameInput) {
        this.rom = new ROM(rom);
        this.joypad = new JoypadInput(input);
    }

    /** Cycles the whole system for the given number of cycles. */
    cycles(cycles: number) {}

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): AddressData {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Registers
        if (pos === 0xff00) return [this.joypad, 0];
        if (pos === 0xff0f) return [this.intFlag, 0];
        if (pos === 0xffff) return [this.intEnable, 0];

        // ROM Bank
        if (0x0000 <= pos && pos <= 0x7fff) return [this.rom, pos];
        // Work RAM (WRAM)
        if (0xc000 <= pos && pos <= 0xdfff) return [this.wram, pos - 0xc000];
        // High RAM (HRAM)
        if (0xff80 <= pos && pos <= 0xfffe) return [this.hram, pos - 0xff80];

        throw new Error(`Read from currently unsupported address ${pos.toString(16)}`);
    }

    /**
     * Reads the data at the given 16-bit address. This method will follow the memory map and
     * return the data belonging to the right component.
     */
    read(pos: number): number {
        const [component, address] = this.getAddress(pos);
        return component.read(address);
    }
    /**
     * Write the 8-bit data at the given 16-bit address. This method will follow the memory map
     * and write the data in the right component.
     */
    write(pos: number, data: number): void {
        const [component, address] = this.getAddress(pos);
        component.write(address, data);
    }

    /** Reads user input */
    readInput() {
        this.joypad.readInput();
    }

    /** Enables the master interrupt toggle. */
    enableInterrupts() {
        this.intMasterEnable = true;
    }
    /** Disables the master interrupt toggle. */
    disableInterrupts() {
        this.intMasterEnable = false;
    }
    /** Requests an interrupt for the given flag type. */
    requestInterrupt(flag: number) {
        this.intFlag.sflag(flag, true);
    }
    /**
     * Looks at the interrupts to and decides if an exceptional call must be made, and if so,
     * where (if no call must be made, returns `null`).
     */
    executeNext(): number | null {
        if (!this.intMasterEnable) return null;
        /* List of flags for the interrupts, and where they make a call. */
        const interruptCalls: [number, number][] = [
            [IFLAG_VBLANK, 0x0040],
            [IFLAG_LCDC, 0x0048],
            [IFLAG_TIMER, 0x0050],
            [IFLAG_SERIAL, 0x0058],
            [IFLAG_JOYPAD, 0x0060],
        ];
        for (const [flag, address] of interruptCalls) {
            if (this.intEnable.flag(flag) && this.intFlag.flag(flag)) {
                this.intFlag.sflag(flag, false);
                return address;
            }
        }
        return null;
    }
}

export default System;
