import Addressable from "./Addressable";
import Audio from "./Audio";
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
import GPU from "./GPU";
import JoypadInput from "./JoypadInput";
import { RAM } from "./Memory";
import OAM from "./OAM";
import { SubRegister } from "./Register";
import ROM from "./ROM";
import Timer from "./Timer";
import GameBoyOutput from "./GameBoyOutput";

type AddressData = [Addressable, number];

class System implements Addressable {
    // Core components / memory
    protected rom: ROM;
    protected gpu: GPU;
    protected wram: RAM = new RAM(WRAM_SIZE);
    protected hram: RAM = new RAM(HRAM_SIZE);

    // Interrupts
    protected intMasterEnable: boolean = false; // IME - master enable flag
    protected intEnable = new SubRegister(0x00); // IE - interrupt enable (handler)
    protected intFlag = new SubRegister(0xe1); // IF - interrupt flag (requests)

    // Devices
    protected timer = new Timer();
    protected audio = new Audio();
    protected oam = new OAM();
    protected joypad: JoypadInput;
    protected unhalt: () => void;

    // Debug
    protected serialOut: undefined | ((data: number) => void);

    constructor(rom: Uint8Array, input: GameInput, output: GameBoyOutput, unhalt: () => void) {
        this.rom = new ROM(rom);
        this.joypad = new JoypadInput(input);
        this.gpu = new GPU(output);
        this.unhalt = unhalt;
        this.serialOut = output.serialOut;
    }

    /** Ticks the whole system for the given number of cycles. */
    tick() {
        for (let i = 0; i < 4; i++) {
            this.gpu.tick(this);
            this.oam.tick(this);
        }
        this.timer.tick(this);
    }

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): AddressData {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Registers
        const register = {
            0xff00: this.joypad,

            0xff04: this.timer,
            0xff05: this.timer,
            0xff06: this.timer,
            0xff07: this.timer,

            0xff0f: this.intFlag,
            0xff46: this.oam,
            0xffff: this.intEnable,
        }[pos];
        if (register !== undefined) return [register, pos];

        // Serial in/out
        if (pos === 0xff02) {
            return [new SubRegister(), 0];
        }
        if (pos === 0xff01) {
            const spy = new SubRegister();
            spy.read = () => 0;
            spy.write = (pos, data) => this.serialOut && this.serialOut(data);
            return [spy, 0];
        }

        // GPU Registers
        if (0xff40 <= pos && pos <= 0xff4b) return [this.gpu, pos];

        // Audio registers
        if (0xff10 <= pos && pos <= 0xff26) return [this.audio, pos];
        // Audio wave
        if (0xff30 <= pos && pos <= 0xff3f) return [this.audio, pos];

        // ROM Bank
        if (0x0000 <= pos && pos <= 0x7fff) return [this.rom, pos];
        // Video RAM (VRAM)
        if (0x8000 <= pos && pos <= 0x9fff) return [this.gpu, pos];
        // External RAM (ERAM)
        if (0xa000 <= pos && pos <= 0xbfff) return [this.rom, pos];
        // Work RAM (WRAM)
        if (0xc000 <= pos && pos <= 0xdfff) return [this.wram, pos & (WRAM_SIZE - 1)];
        // Echo RAM
        if (0xe000 <= pos && pos <= 0xfdff) return [this.wram, pos & (WRAM_SIZE - 1)];
        // OAM
        if (0xfe00 <= pos && pos <= 0xfe9f) return [this.oam, pos];
        // Illegal Area
        if (0xfea0 <= pos && pos <= 0xfeff) {
            console.debug(
                `Accessed illegal area ${pos
                    .toString(16)
                    .padStart(4, "0")}, return a fake 0x00 register`
            );
            return [{ read: () => 0x00, write: () => {} }, 0];
        }
        // High RAM (HRAM)
        if (0xff80 <= pos && pos <= 0xfffe) return [this.hram, pos - 0xff80];

        console.debug(
            `Accessed unmapped area ${pos
                .toString(16)
                .padStart(4, "0")}, return a fake 0xff register`
        );
        return [{ read: () => 0xff, write: () => {} }, 0];
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

    /**
     * Returns the chain of bytes at the given address, for the given length.
     * @param pos The start position of the inspection
     * @param length The number of inspected bytes
     * @param format The formatting of the values (e.g. 16 for hexadecimal)
     */
    inspect(pos: number, length: number = 16, format: number = 16): string {
        return [...new Array(length)]
            .map((_, index) =>
                this.read(pos + index)
                    .toString(format)
                    .padStart((255).toString(format).length, "0")
            )
            .join("");
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
        this.unhalt();
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

    /**
     * Returns the sprites stored in the OAM.
     * @link https://gbdev.io/pandocs/OAM.html
     */
    getSprites() {
        return this.oam.getSprites();
    }
}

export default System;
