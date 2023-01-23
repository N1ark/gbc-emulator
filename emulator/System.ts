import APU from "./apu/APU";
import { ConsoleType, HRAM_SIZE } from "./constants";
import GameBoyInput from "./GameBoyInput";
import PPU from "./ppu/PPU";
import JoypadInput from "./JoypadInput";
import { CircularRAM, RAM, Addressable } from "./Memory";
import {
    CustomRegister,
    PaddedSubRegister,
    Register00,
    RegisterFF,
    SpyRegister,
    SubRegister,
} from "./Register";
import ROM from "./ROM";
import Timer from "./Timer";
import GameBoyOutput from "./GameBoyOutput";
import { fillMap, Int8Map, low } from "./util";
import BootROM from "./BootROM";
import { DMGWRAM, GBCWRAM } from "./WRAM";
import Interrupts from "./Interrupts";

class System implements Addressable {
    // General use
    protected mode: ConsoleType;

    // Core components / memory
    protected ppu: PPU;
    protected interrupts: Interrupts = new Interrupts();
    protected timer: Timer = new Timer();
    protected apu: APU;
    protected joypad: JoypadInput;

    // Memory
    protected bootRom: Addressable;
    protected rom: ROM;
    protected wram: Addressable;
    protected hram: RAM = new CircularRAM(HRAM_SIZE, 0xff80);

    // System registers
    protected bootRomRegister: SubRegister = new CustomRegister(
        (current, value) => current | value,
        0xfe
    );
    protected speedModeRegister: SubRegister = new SpyRegister((value) =>
        console.log(`wrote to speed mode register: ${value}`)
    );

    /**
     * Mapping of addressables dependending on the last (most significant) nibble of an address
     * e.g. 0x0 to 0x7 maps to ROM, etc.
     */
    protected addressesLastNibble: Int8Map<Addressable> = new Map<u8, Addressable>();
    /**
     * Mapping of addressables depending on the first (most significant) byte of an address -
     * this is only applicable to the 0xff00 to 0xffff range.
     * e.g. 0x00 maps to joypad, 0x01 maps to serial,0x04 to 0x07 maps to timer, etc.
     */
    protected addressesRegisters: Int8Map<Addressable> = new Map<u8, Addressable>();

    // Debug
    protected serialOut: (data: number) => void;

    constructor(
        rom: StaticArray<u8>,
        input: GameBoyInput,
        output: GameBoyOutput,
        mode: ConsoleType
    ) {
        this.mode = mode;
        this.bootRom = BootROM(mode);
        this.rom = new ROM(rom);
        this.ppu = new PPU(mode);
        this.wram = mode === ConsoleType.DMG ? new DMGWRAM() : new GBCWRAM();
        this.joypad = new JoypadInput(input);
        this.apu = new APU(output);
        this.serialOut = output.serialOut;

        // most significant nibble (0x?000)
        fillMap(<u8>0x0, <u8>0x7, this.addressesLastNibble, this.rom);
        fillMap(<u8>0x8, <u8>0x9, this.addressesLastNibble, this.ppu);
        fillMap(<u8>0xa, <u8>0xb, this.addressesLastNibble, this.rom);
        fillMap(<u8>0xc, <u8>0xe, this.addressesLastNibble, this.wram); // wram and echo

        // least significant byte (0xff00 to 0xffff)
        this.addressesRegisters.set(0x00, this.joypad); // joypad
        this.addressesRegisters.set(0x01, new SpyRegister(this.serialOut)); // SB - serial data
        this.addressesRegisters.set(0x02, Register00); // CB - serial control
        fillMap(<u8>0x04, <u8>0x07, this.addressesRegisters, this.timer); // timer registers
        this.addressesRegisters.set(0x0f, this.interrupts); // IF
        fillMap(<u8>0x10, <u8>0x26, this.addressesRegisters, this.apu); // actual apu registers
        fillMap(<u8>0x30, <u8>0x3f, this.addressesRegisters, this.apu); // wave ram
        fillMap(<u8>0x40, <u8>0x4b, this.addressesRegisters, this.ppu); // ppu registers
        if (mode === ConsoleType.CGB) {
            // speed mode register
            this.addressesRegisters.set(0x4d, this.speedModeRegister);
        }
        this.addressesRegisters.set(0x4f, this.ppu); // ppu vram bank register
        this.addressesRegisters.set(0x50, this.bootRomRegister); // boot rom register
        fillMap(<u8>0x51, <u8>0x55, this.addressesRegisters, this.ppu); // ppu vram dma registers
        fillMap(<u8>0x68, <u8>0x6b, this.addressesRegisters, this.ppu); // ppu palette registers (CGB only)
        this.addressesRegisters.set(0x70, this.wram); // wram bank register
        if (mode === ConsoleType.CGB) {
            // undocumented registers
            this.addressesRegisters.set(0x72, new SubRegister());
            this.addressesRegisters.set(0x73, new SubRegister());
            this.addressesRegisters.set(0x74, new SubRegister());
            this.addressesRegisters.set(0x75, new PaddedSubRegister(0b1000_1111));
        }
        fillMap(<u8>0x80, <u8>0xfe, this.addressesRegisters, this.hram); // hram
        this.addressesRegisters.set(0xff, this.interrupts); // IE
    }

    /**
     * Ticks the whole system for one M-cycle.
     * @returns if the CPU should be halted (because a VRAM-DMA is in progress).
     */
    tick(): boolean {
        const haltCpu = this.ppu.tick(this, this.interrupts);
        this.timer.tick(this.interrupts);
        this.apu.tick(this.timer);
        this.interrupts.tick();

        return haltCpu;
    }

    /**
     * Responsible for following the memory map.
     * @link https://gbdev.io/pandocs/Memory_Map.html#memory-map
     */
    protected getAddress(pos: number): Addressable {
        if (pos < 0x0000 || pos > 0xffff)
            throw new Error(`Invalid address to read from ${pos.toString(16)}`);

        // Boot ROM
        if (!this.bootRomRegister.flag(1) && pos < 0x100) return this.bootRom;
        // (the CGB's boot rom extends to 0x900, but leaves a gap for the header)
        if (
            this.mode === ConsoleType.CGB &&
            !this.bootRomRegister.flag(1) &&
            0x200 <= pos &&
            pos < 0x900
        )
            return this.bootRom;

        // Checking last nibble
        let addressable = this.addressesLastNibble.get(<u8>(pos >> 12));
        if (addressable) return addressable;

        // Echo RAM
        if (pos <= 0xfdff) return this.wram;
        // OAM
        if (pos <= 0xfe9f) return this.ppu;
        // Illegal Area
        if (pos <= 0xfeff) return Register00;

        // Registers
        addressable = this.addressesRegisters.get(low(pos));
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
    readInput(): void {
        this.joypad.readInput();
    }

    /** Pushes output data if needed */
    pushOutput(output: GameBoyOutput): void {
        this.ppu.pushOutput(output);
    }

    getInterrupts(): Interrupts {
        return this.interrupts;
    }
}

export default System;
