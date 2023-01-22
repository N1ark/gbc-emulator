import { ConsoleType, CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameBoyInput from "./GameBoyInput";
import System from "./System";
import GameBoyOutput from "./GameBoyOutput";
import { Partial } from "./util";

export type GameBoyColorOptions = {
    bootRom: "none" | "real";
};

const DEFAULT_OPTIONS: GameBoyColorOptions = {
    bootRom: "none",
};

class GameBoyColor {
    protected options: GameBoyColorOptions;

    protected isRunning = false;
    protected cpu: CPU;
    protected system: System;

    protected cpuIsHalted = false;
    protected cycles: number = 0;

    protected output: GameBoyOutput;
    protected breakpoints: (u16 | ((c: CPU) => boolean))[] = [];
    protected cycleChrono: { count: number; time: number } = { count: 0, time: Date.now() };

    constructor(
        mode: ConsoleType,
        rom: StaticArray<u8>,
        input: GameBoyInput,
        output: GameBoyOutput,
        options?: Partial<GameBoyColorOptions>
    ) {
        this.cpu = new CPU();
        this.system = new System(rom, input, output, mode);
        this.output = output;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.setup(mode);
    }

    protected setup(mode: ConsoleType) {
        // Setup registers as if the boot ROM was executed
        if (this.options.bootRom === "none") {
            // CPU
            if (mode === "DMG") {
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
            // General Registers
            this.system["bootRomLocked"] = true;
            // PPU
            this.system["ppu"]["ppu"]["lcdControl"].set(0x91);
        }
    }

    /**
     * Draws a full frame
     * @param frames number of frames to draw (defaults to 1 to draw every frame - can be used
     * to speed up emulation).
     * @param isDebugging whether the emulator is in debugging mode (goes CPU step by step,
     * prints verbose CPU logs).
     * @returns true if emulation was stopped for a reason other than the frame being drawn
     * (a breakpoint was hit, or emulation is being debugged).
     */
    drawFrame(frames: number = 1, isDebugging: boolean = false): boolean {
        const cycleTarget = CYCLES_PER_FRAME * frames;

        const frameDrawStart = Date.now();
        while (this.cycles < cycleTarget) {
            // one CPU step, convert M-cycles to CPU cycles
            let cpuIsDone: boolean;
            if (!this.cpuIsHalted) cpuIsDone = this.cpu.step(this.system, isDebugging);
            else cpuIsDone = true;

            this.cpuIsHalted = this.system.tick();
            this.cycles += 4;
            this.cycleChrono.count += 4;

            // If instruction finished executing
            if (cpuIsDone) {
                if (isDebugging) return true; // going step by step?

                for (let i = 0; i < this.breakpoints.length; i++) {
                    const breakpoint = this.breakpoints[i];
                    if (typeof breakpoint === "number" && breakpoint === this.cpu.getPC()) {
                        return true;
                    } else if (typeof breakpoint === "function" && breakpoint(this.cpu)) {
                        return true;
                    }
                }
            }
        }
        this.cycles %= cycleTarget; // keep leftover cycles

        // Read input
        this.system.readInput();

        // Output
        this.system.pushOutput(this.output);

        // Debug output
        this.output.frameDrawDuration &&
            this.output.frameDrawDuration(Date.now() - frameDrawStart);
        this.output.stepCount && this.output.stepCount(this.cpu.getStepCounts());
        if (this.output.cyclesPerSec && Date.now() - this.cycleChrono.time >= 1000) {
            const count = this.cycleChrono.count;
            this.cycleChrono.time = Date.now();
            this.cycleChrono.count = 0;
            this.output.cyclesPerSec(count);
        }

        return false;
    }
}

export default GameBoyColor;
