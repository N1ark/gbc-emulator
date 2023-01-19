import APU from "./apu/APU";
import {
    ConsoleType,
    HRAM_SIZE,
    IFLAG_JOYPAD,
    IFLAG_LCDC,
    IFLAG_SERIAL,
    IFLAG_TIMER,
    IFLAG_VBLANK,
    WRAM_SIZE,
} from "./constants";
import GameBoyInput from "./GameBoyInput";
import PPU from "./ppu/PPU";
import JoypadInput from "./JoypadInput";
import { CircularRAM, RAM, Addressable } from "./Memory";
import { PaddedSubRegister, Register00, RegisterFF, SubRegister } from "./Register";
import ROM from "./ROM";
import Timer from "./Timer";
import GameBoyOutput from "./GameBoyOutput";
import { Int4, rangeObject } from "./util";
import BootROM from "./BootROM";
import { DMGWRAM, GBCWRAM } from "./WRAM";

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

class System implements Addressable {
    // General use
    protected mode: ConsoleType;

    // Core components / memory
    protected bootRom: Addressable;
    protected rom: ROM;
    protected ppu: PPU;
    protected wram: Addressable;
    protected hram: RAM = new CircularRAM(HRAM_SIZE, 0xff80);

    // System registers
    protected bootRomLocked = false;
    protected bootRomRegister: Addressable = {
        read: () => (this.bootRomLocked ? 0xff : 0xfe),
        write: (pos, value) => (this.bootRomLocked ||= (value & 1) === 1),
    };

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

    constructor(
        rom: Uint8Array,
        input: GameBoyInput,
        output: GameBoyOutput,
        mode: ConsoleType
    ) {
        this.mode = mode;
        this.bootRom = BootROM(mode);
        this.rom = new ROM(rom);
        this.ppu = new PPU(mode);
        this.wram = mode === "DMG" ? new DMGWRAM() : new GBCWRAM();
        this.joypad = new JoypadInput(input);
        this.apu = new APU(output);
        this.serialOut = output.serialOut;

        this.addressesLastNibble = {
            ...rangeObject(0x0, 0x7, this.rom),
            ...rangeObject(0x8, 0x9, this.ppu),
            ...rangeObject(0xa, 0xb, this.rom),
            ...rangeObject(0xc, 0xe, this.wram), // wram and echo
            0xf: undefined, // handled separately
        };

        this.addressesRegisters = {
            0x00: this.joypad, // joypad
            0x01: this.registerSerial, // SB - serial data
            0x02: Register00, // CB - serial control
            ...rangeObject(0x04, 0x07, this.timer), // timer registers
            0x0f: this.intFlag, // IF
            ...rangeObject(0x10, 0x26, this.apu), // actual apu registers
            ...rangeObject(0x30, 0x3f, this.apu), // wave ram
            ...rangeObject(0x40, 0x4b, this.ppu), // ppu registers
            0x4f: this.ppu, // ppu vram bank register
            0x50: this.bootRomRegister, // boot rom register
            ...rangeObject(0x51, 0x55, this.ppu), // ppu vram dma registers
            ...rangeObject(0x68, 0x6b, this.ppu), // ppu palette registers (CGB only)
            0x70: this.wram, // wram bank register
            0x72: mode === "CGB" ? new SubRegister() : undefined, // undocumented register
            0x73: mode === "CGB" ? new SubRegister() : undefined, // undocumented register
            0x74: mode === "CGB" ? new SubRegister() : undefined, // undocumented register
            0x75: mode === "CGB" ? new PaddedSubRegister(0b1000_1111) : undefined, // undocumented register
            ...rangeObject(0x80, 0xfe, this.hram), // hram
            0xff: this.intEnable, // IE
        };
    }

    /** Ticks the whole system for the given number of cycles. */
    tick() {
        this.ppu.tick(this);
        this.timer.tick(this);
        this.apu.tick(this.timer);

        // Tick IME
        this.intMasterEnable = IntMasterEnableState[this.intMasterEnable];
    }

    /**
     * Mapping of addressables dependending on the last (most significant) nibble of an address
     * e.g. 0x0 to 0x7 maps to ROM, etc.
     */
    protected addressesLastNibble: Partial<Record<Int4, Addressable>>;
    /**
     * Mapping of addressables depending on the first (most significant) byte of an address -
     * this is only applicable to the 0xff00 to 0xffff range.
     * e.g. 0x00 maps to joypad, 0x01 maps to serial,0x04 to 0x07 maps to timer, etc.
     */
    protected addressesRegisters: Partial<Record<number, Addressable>>;

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): Addressable {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Boot ROM
        if (!this.bootRomLocked && pos < 0x100) return this.bootRom;
        // (the CGB's boot rom extends to 0x900, but leaves a gap for the header)
        if (!this.bootRomLocked && this.mode === "CGB" && 0x200 <= pos && pos < 0x900)
            return this.bootRom;

        // Checking last nibble
        let addressable = this.addressesLastNibble[(pos >> 12) as Int4];
        if (addressable) return addressable;

        // Echo RAM
        if (pos <= 0xfdff) return this.wram;
        // OAM
        if (pos <= 0xfe9f) return this.ppu;
        // Illegal Area
        if (pos <= 0xfeff) return Register00;

        // Registers
        addressable = this.addressesRegisters[pos & 0xff];
        if (addressable) return addressable;

        console.debug(
            `Accessed unmapped area ${pos
                .toString(16)
                .padStart(4, "0")}, return a fake 0xff register`
        );
        return RegisterFF;
    }

    /**
     * Reads the data at the given 16-bit address. This method will follow the memory map and
     * return the data belonging to the right component.
     */
    read(pos: number): number {
        return this.getAddress(pos).read(pos);
    }
    /**
     * Write the 8-bit data at the given 16-bit address. This method will follow the memory map
     * and write the data in the right component.
     */
    write(pos: number, data: number): void {
        this.getAddress(pos).write(pos, data);
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
    pushOutput(output: GameBoyOutput) {
        this.ppu.pushOutput(output);
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
