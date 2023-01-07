import Addressable from "./Addressable";
import APU from "./apu/APU";
import {
    HRAM_SIZE,
    IFLAG_JOYPAD,
    IFLAG_LCDC,
    IFLAG_SERIAL,
    IFLAG_TIMER,
    IFLAG_VBLANK,
    WRAM_SIZE,
} from "./constants";
import GameBoyInput from "./GameBoyInput";
import PPU from "./PPU";
import JoypadInput from "./JoypadInput";
import { RAM } from "./Memory";
import { PaddedSubRegister, Register00, RegisterFF, SubRegister } from "./Register";
import ROM from "./ROM";
import Timer from "./Timer";
import GameBoyOutput from "./GameBoyOutput";
import { Int4 } from "./util";

type IntMasterEnableStateType = "DISABLED" | "WILL_ENABLE" | "WILL_ENABLE2" | "ENABLED";

/**
 * The state of the IME.
 * We need two transition states, because the system ticks right after the CPU, so if we go
 * straight from WILL_ENABLE to ENABLED the CPU will never tick during a non-enabled state.
 */
const IntMasterEnableState: Record<IntMasterEnableStateType, IntMasterEnableStateType> = {
    DISABLED: "DISABLED",
    WILL_ENABLE: "WILL_ENABLE2",
    WILL_ENABLE2: "ENABLED",
    ENABLED: "ENABLED",
};

const INTERRUPT_CALLS: [number, number][] = [
    [IFLAG_VBLANK, 0x0040],
    [IFLAG_LCDC, 0x0048],
    [IFLAG_TIMER, 0x0050],
    [IFLAG_SERIAL, 0x0058],
    [IFLAG_JOYPAD, 0x0060],
];

type AddressData = [Addressable, number];

class System implements Addressable {
    // Core components / memory
    protected rom: ROM;
    protected ppu: PPU;
    protected wram: RAM = new RAM(WRAM_SIZE);
    protected hram: RAM = new RAM(HRAM_SIZE);

    // Interrupts
    protected intMasterEnable: IntMasterEnableStateType = "DISABLED"; // IME - master enable flag
    protected intEnable = new SubRegister(0x00); // IE - interrupt enable (handler)
    protected intFlag = new PaddedSubRegister(0b1110_0000, 0xe1); // IF - interrupt flag (requests)

    // Devices
    protected timer = new Timer();
    protected apu: APU;
    protected joypad: JoypadInput;

    // Registers + Utility Registers
    protected registerSerial: Addressable = {
        read: () => 0xff,
        write: (pos, value) => this.serialOut && this.serialOut(value),
    };

    // Debug
    protected serialOut: undefined | ((data: number) => void);

    constructor(rom: Uint8Array, input: GameBoyInput, output: GameBoyOutput) {
        this.rom = new ROM(rom);
        this.joypad = new JoypadInput(input);
        this.ppu = new PPU(output);
        this.apu = new APU(output);
        this.serialOut = output.serialOut;
    }

    /** Ticks the whole system for the given number of cycles. */
    tick() {
        this.ppu.tick(this);
        this.timer.tick(this);
        this.apu.tick(this);

        // Tick IME
        this.intMasterEnable = IntMasterEnableState[this.intMasterEnable];
    }

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): AddressData {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Checking leftmost symbol of address (X000)
        switch ((pos >> 12) & (0xf as Int4)) {
            case 0x0:
            case 0x1:
            case 0x2:
            case 0x3:
            case 0x4:
            case 0x5:
            case 0x6:
            case 0x7:
                return [this.rom, pos]; // ROM
            case 0x8:
            case 0x9:
                return [this.ppu, pos]; // VRAM
            case 0xa:
            case 0xb:
                return [this.rom, pos]; // ERAM
            case 0xc:
            case 0xd:
                return [this.wram, pos & (WRAM_SIZE - 1)]; // WRAM
            case 0xe:
                return [this.wram, pos & (WRAM_SIZE - 1)]; // ECHO RAM
            case 0xf:
                break; // fall through - ECHO RAM + registers
        }

        // Echo RAM
        if (pos <= 0xfdff) return [this.wram, pos & (WRAM_SIZE - 1)];

        // OAM
        if (pos <= 0xfe9f) return [this.ppu, pos];

        // Illegal Area
        if (pos <= 0xfeff) {
            console.debug(
                `Accessed illegal area ${pos.toString(16)}, returned a fake 0x00 register`
            );
            return [Register00, 0];
        }

        // Registers
        switch (pos) {
            case 0xff00:
                return [this.joypad, pos];
            case 0xff01:
                return [this.registerSerial, pos];
            case 0xff02:
                return [Register00, pos];
            case 0xff04:
            case 0xff05:
            case 0xff06:
            case 0xff07:
                return [this.timer, pos];
            case 0xff40:
            case 0xff41:
            case 0xff42:
            case 0xff43:
            case 0xff44:
            case 0xff45:
            case 0xff46:
            case 0xff47:
            case 0xff48:
            case 0xff49:
            case 0xff4a:
            case 0xff4b:
                return [this.ppu, pos];
            case 0xff0f:
                return [this.intFlag, pos];
            case 0xffff:
                return [this.intEnable, pos];
            default:
                break;
        }

        // Audio registers
        if (0xff10 <= pos && pos <= 0xff26) return [this.apu, pos];
        // Audio wave
        if (0xff30 <= pos && pos <= 0xff3f) return [this.apu, pos];

        // High RAM (HRAM)
        if (0xff80 <= pos && pos <= 0xfffe) return [this.hram, pos - 0xff80];

        console.debug(
            `Accessed unmapped area ${pos
                .toString(16)
                .padStart(4, "0")}, return a fake 0xff register`
        );
        return [RegisterFF, 0];
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
            .join(" ");
    }

    /** Reads user input */
    readInput() {
        this.joypad.readInput();
    }

    /** Pushes output data if needed */
    pushOutput() {
        this.ppu.pushOutput();
    }

    get interruptsEnabled(): boolean {
        return this.intMasterEnable === "ENABLED";
    }

    /** Enables the master interrupt toggle. */
    enableInterrupts() {
        if (this.intMasterEnable === "DISABLED") this.intMasterEnable = "WILL_ENABLE";
    }
    /** Disables the master interrupt toggle. */
    disableInterrupts() {
        this.intMasterEnable = "DISABLED";
    }

    /**
     * Forces the transition to IME = enabled (needed when halting).
     * Returns the state of the IME: enabled (true) or disabled (false)
     */
    fastEnableInterrupts(): boolean {
        // forces transition
        if (this.intMasterEnable !== "DISABLED") {
            this.intMasterEnable = "ENABLED";
        }
        return this.intMasterEnable === "ENABLED";
    }

    /** Requests an interrupt for the given flag type. */
    requestInterrupt(flag: number) {
        this.intFlag.sflag(flag, true);
    }

    /** Returns whether there are any interrupts to handle. (IE & IF) */
    get hasPendingInterrupt(): boolean {
        return !!(this.intEnable.get() & this.intFlag.get() & 0b11111);
    }

    /**
     * Returns the address for the current interrupt handler. This also disables interrupts, and
     * clears the interrupt flag.
     */
    handleNextInterrupt(): number {
        for (const [flag, address] of INTERRUPT_CALLS) {
            if (this.intEnable.flag(flag) && this.intFlag.flag(flag)) {
                this.intFlag.sflag(flag, false);
                this.disableInterrupts();
                return address;
            }
        }
        throw new Error("Cleared interrupt but nothing was called");
    }
}

export default System;
