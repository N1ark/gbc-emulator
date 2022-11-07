import { CYCLES_PER_FRAME } from "./constants";
import CPU from "./CPU";
import GameInput from "./GameInput";
import JoypadInput from "./JoypadInput";
import System from "./System";
import VideoOutput from "./VideoOutput";

class GameBoyColor {
    protected isRunning = true;
    protected cpu: CPU;
    protected system: System;

    protected input: JoypadInput;
    protected output: VideoOutput;

    constructor(rom: string, input: GameInput, output: VideoOutput) {
        this.cpu = new CPU();
        this.system = new System(rom);
        this.input = new JoypadInput(input);
        this.output = output;
    }

    drawFrame() {
        let cycles = 0;
        // new video sink

        while (cycles < CYCLES_PER_FRAME) {
            cycles += this.cpu.step(this.system);
        }

        // consume the sink

        // Render the screen
        const output = new Uint8ClampedArray();
        this.output.receive(output);

        // Read input
        this.input.readInput();
    }

    run() {
        if (!this.isRunning) return;
        this.drawFrame();
        window.requestAnimationFrame(() => this.run());
    }
}

export default GameBoyColor;
