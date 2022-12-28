import Addressable from "../Addressable";
import { CLOCK_SPEED } from "../constants";
import { SubRegister } from "../Register";
import { APU } from "./APU";

const FREQUENCY_SWEEP_PACE = Math.floor(CLOCK_SPEED / 128);
const FREQUENCY_ENVELOPE = Math.floor(CLOCK_SPEED / 64);
const FREQUENCY_LENGTH_TIMER = Math.floor(CLOCK_SPEED / 256);

const NRX4_RESTART_CHANNEL = 1 << 7;
const NRX4_LENGTH_TIMER_FLAG = 1 << 6;

abstract class SoundChannel implements Addressable {
    // Channel-dependent
    protected abstract readonly NRX1_LENGTH_TIMER_BITS: number;

    // Common registers
    protected abstract nrX1: SubRegister;
    protected abstract nrX2: SubRegister;
    protected abstract nrX3: SubRegister;
    protected abstract nrX4: SubRegister;

    // State
    protected enabled = false;
    protected onStateChange: (state: boolean) => void;

    // Counters
    protected lengthTimerCounter: number = 0;

    constructor(onStateChange: (state: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    tick(apu: APU): void {
        if (!this.enabled) return;

        // Tick length timer
        if (
            this.nrX4.flag(NRX4_LENGTH_TIMER_FLAG) &&
            this.lengthTimerCounter++ >= FREQUENCY_LENGTH_TIMER
        ) {
            const timerBits = this.NRX1_LENGTH_TIMER_BITS;
            const nrx1 = this.nrX1.get();
            const lengthTimer = ((nrx1 & timerBits) + 1) & timerBits;
            this.nrX1.set((nrx1 & ~timerBits) | lengthTimer);
            // overflowed
            if (lengthTimer === 0) {
                this.stop();
            }
        }
    }

    start(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.onStateChange(true);
    }

    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.onStateChange(false);
        this.lengthTimerCounter = 0;
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
export { NRX4_RESTART_CHANNEL, FREQUENCY_SWEEP_PACE, FREQUENCY_ENVELOPE };
