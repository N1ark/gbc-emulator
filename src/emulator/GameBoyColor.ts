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

    drawFrame() {
        const debugging = this.debug && !this.debug().skipDebug;
        // new video sink

        while (this.cycles < CYCLES_PER_FRAME) {
            // one CPU step, convert M-cycles to CPU cycles
            const cycles = this.cpu.step(this.system, debugging) * 4;
            this.system.tick(cycles);
            this.cycles += cycles;

            if (debugging) {
                return;
            }
        }
        this.cycles %= CYCLES_PER_FRAME; // keep leftover cycles

        // Read input
        this.system.readInput();
    }

    run() {
        if (!this.isRunning) return;
        this.drawFrame();

        if (this.debug && !this.debug().skipDebug) {
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
