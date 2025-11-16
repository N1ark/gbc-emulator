import { ConsoleType, CYCLES_PER_FRAME, SpeedMode } from "./constants";
import CPU from "./CPU";
import GameBoyInput from "./GameBoyInput";
import GameBoyOutput from "./GameBoyOutput";
import System from "./System";

export type GameBoyColorOptions = {
    bootRom: null | Uint8Array;
};

const DEFAULT_OPTIONS: GameBoyColorOptions = {
    bootRom: null,
};

class GameBoyColor {
    protected options: GameBoyColorOptions;
    protected mode: ConsoleType;

    protected cpu: CPU;
    protected system: System;

    protected cpuIsHalted = false;
    protected cycles: number = 0;
    protected isFullCycle = true; // used for double speed mode

    protected output: GameBoyOutput;

    constructor(
        modeStr: "DMG" | "CGB",
        rom: Uint8Array,
        input: GameBoyInput,
        output: GameBoyOutput,
        options?: Partial<GameBoyColorOptions>,
    ) {
        this.mode = modeStr === "DMG" ? ConsoleType.DMG : ConsoleType.CGB;
        this.system = new System(rom, input, output, this.mode);
        this.cpu = new CPU(() => this.system.didStopInstruction());
        this.output = output;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.setup();
    }

    protected setup() {
        if (this.options.bootRom !== null) {
            if (this.mode === ConsoleType.DMG && this.options.bootRom.length !== 256) {
                throw new Error("DMG boot ROM must be 256 bytes long");
            }
            if (this.mode === ConsoleType.CGB && this.options.bootRom.length !== 2304) {
                throw new Error("CGB boot ROM must be 2304 bytes long");
            }
            this.system.loadBootRom(this.options.bootRom);
        }

        // Setup registers as if the boot ROM was executed
        else {
            // CPU
            if (this.mode === ConsoleType.DMG) {
                this.cpu["regAF"].set(0x01b0);
                this.cpu["regBC"].set(0x0013);
                this.cpu["regDE"].set(0x00d8);
                this.cpu["regHL"].set(0x014d);
            } else {
                this.cpu["regAF"].set(0x1180);
                this.cpu["regBC"].set(0x0000);
                this.cpu["regDE"].set(0xff56);
                this.cpu["regHL"].set(0x000d);
            }
            this.cpu["regPC"].set(0x0100);
            this.cpu["regSP"].set(0xfffe);

            // PPU
            this.system["ppu"]["ppu"]["lcdControl"].set(0x91);

            // Emulate GBC compatibility check
            if (this.mode === ConsoleType.CGB) {
                const compat = this.system.read(0x0143);
                if (compat === 0x80 || compat === 0xc0) {
                    this.system.write(0xff4c, compat);
                } else {
                    const colorControl = this.system["ppu"]["ppu"]["colorControl"];
                    // reset palette controls
                    colorControl.write(0xff68, 0x80);
                    colorControl.write(0xff6a, 0x80);

                    // load palettes
                    const bgrPalette = [0xff, 0x7f, 0xef, 0x1b, 0x80, 0x61, 0x00, 0x00];
                    const objPalette = [0xff, 0x7f, 0x1f, 0x42, 0xf2, 0x1c, 0x00, 0x00];
                    bgrPalette.forEach((value) => colorControl.write(0xff69, value)); // bg
                    objPalette.forEach((value) => colorControl.write(0xff6b, value)); // obj0
                    objPalette.forEach((value) => colorControl.write(0xff6b, value)); // obj1

                    this.system.write(0xff4c, 0x04); // change to DMG mode
                    this.system["ppu"]["ppu"]["objPriorityMode"].write(0, 0x01); // OPRI
                }
            }

            // End initialisation
            this.system["bootRomLocked"] = true;
        }
    }

    /**
     * @returns whether the emulator supports saving the current ROM state.
     */
    supportsSaves(): boolean {
        return this.system.supportsSaves();
    }

    /** Saves the current ROM state (null if no save support). */
    save(): Uint8Array | null {
        return this.system.save();
    }

    /** Loads the given ROM data. */
    load(data: Uint8Array): void {
        this.system.load(data);
    }

    /** Returns the title of the current ROM. */
    getTitle(): string {
        return this.system.getTitle();
    }

    /** Returns the identifier of the current ROM. */
    getIdentifier(): string {
        return this.system.getIdentifier();
    }

    /** The current mode of the emulator. */
    getMode(): "DMG" | "CGB" {
        return this.mode === ConsoleType.DMG ? "DMG" : "CGB";
    }

    /**
     * Draws a full frame
     * @param frames number of frames to draw (defaults to 1 to draw every frame - can be used
     * to speed up emulation).
     * @param isDebugging whether the emulator is in debugging mode (goes CPU step by step,
     * prints verbose CPU logs).
     * @returns the number of T-cycles executed.
     */
    drawFrame(frames: number = 1, isDebugging: boolean = false): number {
        const cycleTarget = CYCLES_PER_FRAME * frames;
        const interrupts = this.system.getInterrupts();
        const cyclesStart = this.cycles;

        while (this.cycles < cycleTarget) {
            const normalSpeedMode = this.system.getSpeedMode() === SpeedMode.Normal;
            const cycles = normalSpeedMode ? 4 : 2;
            this.isFullCycle = normalSpeedMode || !this.isFullCycle;

            // one CPU step, convert M-cycles to CPU cycles
            let cpuIsDone: boolean;
            if (!this.cpuIsHalted)
                cpuIsDone = this.cpu.step(this.system, interrupts, isDebugging);
            else cpuIsDone = true;

            this.cpuIsHalted = this.system.tick(this.isFullCycle);

            this.cycles += cycles;

            // If instruction finished executing and we're debugging
            if (cpuIsDone && isDebugging) return this.cycles - cyclesStart;
        }

        // Keep leftover cycles
        const cyclesRan = this.cycles - cyclesStart;
        this.cycles %= cycleTarget;

        // Read input
        this.system.readInput();

        // Output
        this.system.pushOutput(this.output);

        return cyclesRan;
    }
}

export default GameBoyColor;
