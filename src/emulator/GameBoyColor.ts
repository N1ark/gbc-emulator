import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameBoyInput from "./GameBoyInput";
import System from "./System";
import GameBoyOutput from "./GameBoyOutput";

class GameBoyColor {
    protected isRunning = false;
    protected cpu: CPU;
    protected system: System;

    protected cycles: number;

    protected output: GameBoyOutput;
    protected breakpoints: (number | ((c: CPU) => boolean))[] = [];
    protected cycleChrono: { count: number; time: number } = { count: 0, time: Date.now() };

    constructor(rom: Uint8Array, input: GameBoyInput, output: GameBoyOutput) {
        this.cpu = new CPU();
        this.system = new System(rom, input, output);
        this.cycles = 0;
        this.output = output;
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

        const frameDrawStart = window.performance.now();
        while (this.cycles < cycleTarget) {
            // one CPU step, convert M-cycles to CPU cycles
            const cpuIsDone = this.cpu.step(this.system, isDebugging);
            this.system.tick();
            this.cycles += 4;
            this.cycleChrono.count += 4;

            // If instruction finished executing
            if (cpuIsDone) {
                if (isDebugging) return true; // going step by step?

                const foundBreakpoint = this.breakpoints.find(
                    (breakpoint) =>
                        (typeof breakpoint === "number" && breakpoint === this.cpu.getPC()) ||
                        (typeof breakpoint === "function" && breakpoint(this.cpu))
                );
                if (foundBreakpoint) return true; // breakpoint hit?
            }
        }
        this.cycles %= cycleTarget; // keep leftover cycles

        // Read input
        this.system.readInput();

        // Output
        this.system.pushOutput(this.output);

        // Debug output
        this.output.frameDrawDuration &&
            this.output.frameDrawDuration(window.performance.now() - frameDrawStart);
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
