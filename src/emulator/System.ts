import APU from "./apu/APU";
import { CGBMode, ConsoleType, HRAM_SIZE, SpeedMode } from "./constants";
import GameBoyInput from "./GameBoyInput";
import GameBoyOutput from "./GameBoyOutput";
import GameCartridge from "./GameCartridge";
import Interrupts from "./Interrupts";
import JoypadInput from "./JoypadInput";
import { Addressable, CircularRAM, RAM, ROM } from "./Memory";
import PPU from "./ppu/PPU";
import { MaskRegister, Register, Register00, RegisterFF } from "./Register";
import Timer from "./Timer";
import { Int4, rangeObject } from "./util";
import { DMGWRAM, GBCWRAM } from "./WRAM";

const KEY0_DISABLE_ALL = 1 << 2;
const KEY0_DISABLE_SOME = 1 << 3;

class System implements Addressable {
    // General use
    protected mode: ConsoleType;

    // Devices
    protected timer = new Timer();
    protected apu: APU;
    protected joypad: JoypadInput;
    protected ppu: PPU;
    protected interrupts: Interrupts = new Interrupts();

    // Memory
    protected bootRom: ROM;
    protected cartridge: GameCartridge;
    protected wram: Addressable;
    protected hram: RAM = new CircularRAM(HRAM_SIZE, 0xff80);

    // System registers
    protected bootRomLocked = false;
    protected bootRomRegister: Addressable = {
        read: () => (this.bootRomLocked ? 0xff : 0xfe),
        write: (pos, value) => (this.bootRomLocked ||= (value & 1) === 1),
    };

    // KEY0: CGB features toggle (CGB Register)
    protected cgbMode: CGBMode = CGBMode.CGB;
    protected key0Register: Addressable = {
        read: () => {
            return 0x0;
        },
        write: (_, value) => {
            if (this.bootRomLocked) return; // becomes read-only after boot rom is disabled

            if (value & KEY0_DISABLE_SOME) this.cgbMode = CGBMode.DMGExtended;
            else if (value & KEY0_DISABLE_ALL) this.cgbMode = CGBMode.DMG;
            else this.cgbMode = CGBMode.CGB;

            this.ppu.setCGBMode(this.cgbMode);
            this.addressesRegisters[0x4d] =
                this.cgbMode === CGBMode.CGB ? this.key1Register : undefined;
        },
    };

    // KEY1: Speed switch register (CGB Register)
    protected speedMode: SpeedMode = SpeedMode.Normal;
    protected wantsSpeedModeChange = false;
    protected key1Register: Addressable = {
        read: () =>
            (this.speedMode === SpeedMode.Double ? 1 << 7 : 0) |
            (this.wantsSpeedModeChange ? 1 << 0 : 0),
        write: (_, value) => (this.wantsSpeedModeChange = (value & 1) === 1),
    };

    constructor(
        rom: Uint8Array,
        input: GameBoyInput,
        output: GameBoyOutput,
        mode: ConsoleType,
    ) {
        this.mode = mode;
        this.bootRom = new ROM(mode === ConsoleType.DMG ? 0x100 : 0x900);
        this.cartridge = new GameCartridge(rom);
        this.ppu = new PPU(mode);
        this.wram = mode === ConsoleType.DMG ? new DMGWRAM() : new GBCWRAM();
        this.joypad = new JoypadInput(input);
        this.apu = new APU(output);

        const registerSerial: Addressable = {
            read: () => 0xff,
            write: (pos, value) => output.serialOut && output.serialOut(value),
        };

        this.addressesLastNibble = {
            ...rangeObject(0x0, 0x7, this.cartridge),
            ...rangeObject(0x8, 0x9, this.ppu),
            ...rangeObject(0xa, 0xb, this.cartridge),
            ...rangeObject(0xc, 0xe, this.wram), // wram and echo
            0xf: undefined, // handled separately
        };

        this.addressesRegisters = {
            0x00: this.joypad, // joypad
            0x01: registerSerial, // SB - serial data
            0x02: RegisterFF, // CB - serial control
            ...rangeObject(0x04, 0x07, this.timer), // timer registers
            0x0f: this.interrupts, // IF
            ...rangeObject(0x10, 0x26, this.apu), // actual apu registers
            ...rangeObject(0x30, 0x3f, this.apu), // wave ram
            ...rangeObject(0x40, 0x4b, this.ppu), // ppu registers
            0x4c: mode === ConsoleType.CGB ? this.key0Register : undefined, // KEY0 -
            0x4d: mode === ConsoleType.CGB ? this.key1Register : undefined, // KEY1 - speed switch
            0x4f: this.ppu, // ppu vram bank register
            0x50: this.bootRomRegister, // boot rom register
            ...rangeObject(0x51, 0x55, this.ppu), // ppu vram dma registers
            ...rangeObject(0x68, 0x6b, this.ppu), // ppu palette registers (CGB only)
            0x70: mode === ConsoleType.CGB ? this.wram : undefined, // wram bank register
            0x72: mode === ConsoleType.CGB ? new Register() : undefined, // undocumented register
            0x73: mode === ConsoleType.CGB ? new Register() : undefined, // undocumented register
            0x74: mode === ConsoleType.CGB ? new Register() : undefined, // undocumented register
            0x75: mode === ConsoleType.CGB ? new MaskRegister(0b1000_1111) : undefined, // undocumented register
            0x76: mode === ConsoleType.CGB ? this.apu : undefined, // PCM12
            0x77: mode === ConsoleType.CGB ? this.apu : undefined, // PCM34
            ...rangeObject(0x80, 0xfe, this.hram), // hram
            0xff: this.interrupts, // IE
        };
    }

    /**
     * Ticks the whole system for one M-cycle.
     * @param isMCycle if the tick is a regular M-cycle (everything runs) or a double-speed mode
     * cycle (the APU and PPU don't run).
     * @returns if the CPU should be halted (because a VRAM-DMA is in progress).
     */
    tick(isMCycle: boolean): boolean {
        const haltCpu = this.ppu.tick(this, this.interrupts, isMCycle);
        this.timer.tick(this.interrupts);
        if (isMCycle) this.apu.tick(this.timer);
        this.interrupts.tick();

        return haltCpu;
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
        if (!this.bootRomLocked) {
            if (pos < 0x100) return this.bootRom;
            // (the CGB's boot rom extends to 0x900, but leaves a gap for the header)
            if (this.mode === ConsoleType.CGB && 0x200 <= pos && pos < 0x900)
                return this.bootRom;
        }

        // Checking last nibble
        let addressable = this.addressesLastNibble[(pos >> 12) as Int4];
        if (addressable) return addressable;

        // Registers
        if ((pos & 0xff00) === 0xff00) {
            addressable = this.addressesRegisters[pos & 0xff];
            if (addressable) return addressable;
        }

        // Echo RAM
        if (pos <= 0xfdff) return this.wram;
        // OAM
        if (pos <= 0xfe9f) return this.ppu;
        // Illegal Area
        if (pos <= 0xfeff) return Register00;

        console.debug(
            `Accessed unmapped area ${pos
                .toString(16)
                .padStart(4, "0")}, return a fake 0xff register`,
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
     * When the STOP (0x10) instruction is executed, the system clock will stop. If a speed
     * mode change is requested, this will be applied and the system will continue.
     */
    didStopInstruction() {
        if (this.wantsSpeedModeChange) {
            this.wantsSpeedModeChange = false;
            this.speedMode =
                this.speedMode === SpeedMode.Double ? SpeedMode.Normal : SpeedMode.Double;
        }
    }

    getSpeedMode(): SpeedMode {
        return this.speedMode;
    }

    getInterrupts(): Interrupts {
        return this.interrupts;
    }

    /**
     * Sets the boot ROM data. This will be used on the start up of the system, if the boot ROM
     * is not skipped.
     */
    loadBootRom(data: Uint8Array): void {
        this.bootRom.rawSet(data);
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
                    .padStart((255).toString(format).length, "0"),
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

    /**
     * @returns if the system supports saving
     */
    supportsSaves(): boolean {
        return this.cartridge.supportsSaves();
    }

    /** Saves the current ROM state (null if no save support). */
    save(): Uint8Array | null {
        return this.cartridge.save();
    }

    /** Loads the given ROM data. */
    load(data: Uint8Array): void {
        this.cartridge.load(data);
    }

    /** Returns the title of the current ROM. */
    getTitle(): string {
        return this.cartridge.getTitle();
    }

    /** Returns the identifier of the current ROM */
    getIdentifier(): string {
        return this.cartridge.getIdentifier();
    }
}

export default System;
