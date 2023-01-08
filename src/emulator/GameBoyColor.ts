import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameBoyInput from "./GameBoyInput";
import System from "./System";
import GameBoyOutput from "./GameBoyOutput";

type DebugData = {
    canStep: boolean;
    skipDebug: boolean;
    tripleSpeed: boolean;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class GameBoyColor {
    protected isRunning = false;
    protected cpu: CPU;
    protected system: System;

    protected cycles: number;

    protected debug?: () => DebugData;
    protected output: GameBoyOutput;
    protected breakpoints?: (number | [number, (c: CPU) => boolean])[];
    protected cycleChrono: { count: number; time: number } = { count: 0, time: Date.now() };

    constructor(
        rom: Uint8Array,
        input: GameBoyInput,
        output: GameBoyOutput,
        debug?: () => DebugData
    ) {
        this.cpu = new CPU();
        this.system = new System(rom, input, output);
        this.cycles = 0;
        this.output = output;
        this.debug = debug;
    }

    protected totalTime = 0;

    /** Draws a full frame and returns if a breakpoint was reached */
    drawFrame(): boolean {
        const debugResult = this.debug && this.debug();
        const debugging = !debugResult?.skipDebug;
        const cycleTarget = debugResult?.tripleSpeed ? CYCLES_PER_FRAME * 5 : CYCLES_PER_FRAME;

        const frameDrawStart = window.performance.now();
        while (this.cycles < cycleTarget) {
            // one CPU step, convert M-cycles to CPU cycles
            this.cpu.step(this.system, debugging);
            this.system.tick();
            this.cycles += 4;
            this.cycleChrono.count += 4;

            const breakpoint = this.breakpoints?.find(
                (br) =>
                    (typeof br === "number" && br === this.cpu.getPC()) ||
                    (typeof br === "object" && br[0] === this.cpu.getPC() && br[1](this.cpu))
            );
            if (this.cpu["nextStep"] === null && (debugging || breakpoint)) {
                return true;
            }
        }
        this.cycles %= cycleTarget; // keep leftover cycles

        // Read input
        this.system.readInput();

        // Output
        this.system.pushOutput();
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

    protected run() {
        try {
            if (!this.isRunning) return;

            const breakpoint = this.drawFrame();

            if ((this.debug && !this.debug().skipDebug) || breakpoint) {
                // force a "button up, button down, button up" cycle (ie full button press)
                (async () => {
                    if (!this.debug) return;
                    while (this.debug().canStep) await sleep(5);
                    while (!this.debug().canStep) await sleep(5);
                    this.run();
                })();
                return;
            }

            window.requestAnimationFrame(() => this.run());
        } catch (error) {
            this.output.errorOut && this.output.errorOut(error);
        }
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.run();
        }
    }

    stop() {
        this.isRunning = false;
    }
}

export default GameBoyColor;
