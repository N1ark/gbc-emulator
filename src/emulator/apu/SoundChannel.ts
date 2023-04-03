import { Addressable } from "../Memory";
import { Register } from "../Register";
import { Int4 } from "../util";

const FREQUENCY_SWEEP_PACE = 4;
const FREQUENCY_ENVELOPE = 8;
const FREQUENCY_LENGTH_TIMER = 2;

const NRX4_RESTART_CHANNEL = 1 << 7;
const NRX4_LENGTH_TIMER_FLAG = 1 << 6;

abstract class SoundChannel implements Addressable {
    // Channel-dependent
    protected abstract readonly NRX1_LENGTH_TIMER_BITS: number;

    // Common registers
    protected abstract nrX1: Register;
    protected abstract nrX2: Register;
    protected abstract nrX3: Register;
    protected abstract nrX4: Register;

    // State
    protected enabled = false;
    protected onStateChange: (state: boolean) => void;

    // Counters
    protected step: number = 0;

    constructor(onStateChange: (state: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    /**
     * Ticks the whole channel. This method should not be overrided by subclasses - for ticking
     * behavior, override doTick instead.
     * @returns The output of this channel
     */
    tick(divChanged: boolean): Int4 {
        // Ticks even when disabled

        if (divChanged) {
            this.step = (this.step + 1) % 8;

            if (this.step % 2 === 0) {
                this.tickLengthTimer();
            }
            if (this.step % 4 === 2) {
                this.tickSweep();
            }
            if (this.step === 7) {
                this.tickEnvelope();
            }
        }

        if (!this.enabled) return 0;

        this.doTick();

        return this.getSample();
    }

    /** Ticks the length timer. */
    protected tickLengthTimer(): void {
        // Tick length timer
        if (this.nrX4.flag(NRX4_LENGTH_TIMER_FLAG)) {
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

    protected tickSweep(): void {}

    protected tickEnvelope(): void {}

    /**
     * Ticks the channel. This method should be overrided by subclasses for channel-specific
     * behavior.
     */
    protected abstract doTick(): void;

    /**
     * @returns The current value of the channel (value between 0-F).
     */
    protected abstract getSample(): Int4;

    /**
     * @returns The channel's wavelength, using the NRX3 and NRX4 registers. Only relevant for
     * channels 1, 2 and 3.
     */
    protected getWavelength(): number {
        const lower8 = this.nrX3.get();
        const higher3 = this.nrX4.get() & 0b111;
        return (higher3 << 8) | lower8;
    }

    /**
     * @param waveLength The new wavelength, using the NRX3 and NRX4 registers. Only relevant
     * for channels 1, 2 and 3.
     */
    protected setWavelength(waveLength: number): void {
        waveLength &= (1 << 11) - 1; // ensure it fits in 11bits
        const lower8 = waveLength & 0xff;
        const higher3 = (waveLength >> 8) & 0b111;
        this.nrX3.set(lower8);
        this.nrX4.set((this.nrX4.get() & ~0b111) | higher3);
    }

    /**
     * Starts the channel, if it isn't started already.
     */
    protected start(): void {
        if (this.enabled) return;
        if (!this.isDACOn) return;

        this.enabled = true;
        this.onStateChange(true);
        this.onStart();
    }

    /**
     * Stops the channel, if it isn't stopped already.
     */
    protected stop(): void {
        if (!this.enabled) return;

        this.enabled = false;
        this.onStateChange(false);
    }

    protected onStart(): void {}

    protected abstract get isDACOn(): boolean;

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
export { NRX4_RESTART_CHANNEL, FREQUENCY_SWEEP_PACE, FREQUENCY_ENVELOPE };
