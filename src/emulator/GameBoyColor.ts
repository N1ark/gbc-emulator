import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameInput from "./GameInput";
import System from "./System";
import VideoOutput from "./VideoOutput";

type DebugData = {
    canStep: boolean;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class GameBoyColor {
    protected isRunning = true;
    protected cpu: CPU;
    protected system: System;

    protected output: VideoOutput;
    protected cycles: number;

    protected debug?: () => DebugData;

    constructor(rom: string, input: GameInput, output: VideoOutput, debug?: () => DebugData) {
        this.cpu = new CPU();
        this.system = new System(rom, input);
        this.output = output;
        this.cycles = 0;
        this.debug = debug;
        console.log("[debug] Created GBC", this);
    }

    drawFrame() {
        // new video sink

        while (this.cycles < CYCLES_PER_FRAME) {
            // one CPU step, convert M-cycles to CPU cycles
            const cycles = this.cpu.step(this.system, this.debug !== undefined) * 4;
            this.system.cycles(cycles);
            this.cycles += cycles;

            if (this.debug) {
                return;
            }
        }
        this.cpu.debug();
        this.cycles %= CYCLES_PER_FRAME; // keep leftover cycles

        // consume the sink

        // Render the screen
        const output = new Uint8ClampedArray();
        this.output.receive(output);

        // Read input
        this.system.readInput();
    }

    run() {
        if (!this.isRunning) return;
        this.drawFrame();

        if (this.debug) {
            // force a "button up, button down, button up" cycle (ie full button press)
            setTimeout(async () => {
                if (!this.debug) return;
                while (!this.debug().canStep) await sleep(100);
                this.run();
            }, 10);
            return;
        }

        window.requestAnimationFrame(() => this.run());
    }
}

export default GameBoyColor;
