import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameInput from "./GameInput";
import System from "./System";
import VideoOutput from "./VideoOutput";

type DebugData = {
    canStep: boolean;
    skipDebug: boolean;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class GameBoyColor {
    protected isRunning = true;
    protected cpu: CPU;
    protected system: System;

    protected cycles: number;

    protected debug?: () => DebugData;
    protected breakpoints?: (number | [number, (c: CPU) => boolean])[];

    constructor(
        rom: Uint8Array,
        input: GameInput,
        output: VideoOutput,
        debug?: () => DebugData
    ) {
        this.cpu = new CPU();
        this.system = new System(rom, input, output);
        this.cycles = 0;
        this.debug = debug;
        console.log("[debug] Created GBC", this);

        // @ts-ignore helpful for debugging :)
        window.gbc = this;
    }

    /** Draws a full frame and returns if a breakpoint was reached */
    drawFrame(): boolean {
        const debugging = this.debug && !this.debug().skipDebug;
        // new video sink

        while (this.cycles < CYCLES_PER_FRAME) {
            // one CPU step, convert M-cycles to CPU cycles
            const cycles = this.cpu.step(this.system, debugging) * 4;
            this.system.tick(cycles);
            this.cycles += cycles;

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
        return false;
    }

    run() {
        if (!this.isRunning) return;
        const breakpoint = this.drawFrame();

        if ((this.debug && !this.debug().skipDebug) || breakpoint) {
            // force a "button up, button down, button up" cycle (ie full button press)
            setTimeout(async () => {
                if (!this.debug) return;
                while (this.debug().canStep) await sleep(10);
                while (!this.debug().canStep) await sleep(10);
                this.run();
            }, 10);
            return;
        }

        window.requestAnimationFrame(() => this.run());
    }
}

export default GameBoyColor;
