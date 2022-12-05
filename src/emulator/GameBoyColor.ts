import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameInput from "./GameInput";
import System from "./System";
import GameBoyOutput from "./GameBoyOutput";

type DebugData = {
    canStep: boolean;
    skipDebug: boolean;
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
        input: GameInput,
        output: GameBoyOutput,
        debug?: () => DebugData
    ) {
        this.cpu = new CPU();
        this.system = new System(rom, input, output, () => this.cpu.unhalt());
        this.cycles = 0;
        this.output = output;
        this.debug = debug;
        console.debug("[debug] Created GBC", this);

        // @ts-ignore helpful for debugging :)
        window.gbc = this;
    }

    protected totalTime = 0;

    /** Draws a full frame and returns if a breakpoint was reached */
    drawFrame(): boolean {
        const debugging = this.debug && !this.debug().skipDebug;
        const frameDrawStart = window.performance.now();

        while (this.cycles < CYCLES_PER_FRAME) {
            // one CPU step, convert M-cycles to CPU cycles
            this.cpu.step(this.system, debugging);
            this.system.tick();
            this.cycles += 4;

            const breakpoint = this.breakpoints?.find(
                (br) =>
                    (typeof br === "number" && br === this.cpu.getPC()) ||
                    (typeof br === "object" && br[0] === this.cpu.getPC() && br[1](this.cpu))
            );
            if (debugging || breakpoint) {
                return true;
            }
        }
        this.cycles %= CYCLES_PER_FRAME; // keep leftover cycles

        // Read input
        this.system.readInput();

        // Output
        this.output.frameDrawDuration &&
            this.output.frameDrawDuration(window.performance.now() - frameDrawStart);
        if (this.output.cyclesPerSec && Date.now() - this.cycleChrono.time >= 1000) {
            const count = (this.cpu.getStepCounts() - this.cycleChrono.count) * 4;
            this.cycleChrono = {
                time: Date.now(),
                count: this.cpu.getStepCounts(),
            };
            this.output.cyclesPerSec(count);
        }

        return false;
    }

    protected run() {
        try {
            if (!this.isRunning) return;
            const breakpoint = this.drawFrame();

            // Outputs
            this.output.stepCount && this.output.stepCount(this.cpu.getStepCounts());

            if ((this.debug && !this.debug().skipDebug) || breakpoint) {
                // force a "button up, button down, button up" cycle (ie full button press)
                (async () => {
                    if (!this.debug) return;
                    while (this.debug().canStep) await sleep(10);
                    while (!this.debug().canStep) await sleep(10);
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
