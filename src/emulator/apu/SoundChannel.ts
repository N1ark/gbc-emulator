import { Addressable } from "../Memory";
import { Register } from "../Register";
import { Int3, Int4 } from "../util";

export const NRX4_RESTART_CHANNEL = 1 << 7;
export const NRX4_LENGTH_TIMER_FLAG = 1 << 6;

export class LengthCounter {
    private enabled: boolean = false;
    private value: number = 0;
    private readonly max: number;

    constructor(max: number) {
        this.max = max;
    }

    get isActive(): boolean {
        return this.value > 0;
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    enable(enabled: boolean, step: number): void {
        const wasEnabled = this.enabled;
        this.enabled = enabled;
        if (!wasEnabled && step % 2 === 1) {
            this.tick();
        }
    }

    tick(): void {
        if (this.enabled && this.value > 0) {
            this.value = (this.value - 1 + this.max) % this.max;
        }
    }

    set(value: number): void {
        this.value = this.max - value;
    }

    trigger(step: number): void {
        console.log(
            "triggered with value " +
                this.value +
                " and step " +
                step +
                " (max: " +
                this.max +
                ")"
        );
        if (this.value === 0) {
            this.value = this.max;
            if (step % 2 === 1) {
                this.tick();
            }
        }
    }
}

export class VolumeEnvelope {
    private period: Int3 = 0;
    private delay: Int3 = 0;
    private goesUp: boolean = false;

    private initialValue: Int4 = 0;
    private value: Int4 = 0;

    get volume(): Int4 {
        return this.value;
    }

    tick(): void {
        if (this.delay > 1) {
            this.delay--;
        } else {
            this.delay = this.period;
            const direction = this.goesUp ? 1 : -1;
            this.value = Math.max(0x0, Math.min(0xf, this.value + direction)) as Int4;
        }
    }

    trigger(): void {
        this.delay = this.period;
        this.value = this.initialValue;
    }

    write(data: number): void {
        this.period = (data & 0b111) as Int3;
        this.goesUp = (data & 0b1000) !== 0;
        this.initialValue = (data >> 4) as Int4;
        this.value = this.initialValue;
    }

    read(): number {
        return (this.initialValue << 4) | (this.goesUp ? 1 << 3 : 0) | this.period;
    }
}

abstract class SoundChannel implements Addressable {
    // State
    protected enabled = false;
    protected isDACOn: boolean = false;
    protected onStateChange: (state: boolean) => void;

    // Counters
    protected step: number = 0;

    // "Sub-components"
    protected lengthCounter: LengthCounter;
    protected envelope?: VolumeEnvelope;

    constructor(onStateChange: (state: boolean) => void, nrx1LengthTimerBits: number) {
        this.onStateChange = onStateChange;
        this.lengthCounter = new LengthCounter(nrx1LengthTimerBits);
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

    protected trigger(): void {
        this.lengthCounter.trigger(this.step);
        this.envelope?.trigger();
    }

    /** Ticks the length timer. */
    protected tickLengthTimer(): void {
        this.lengthCounter.tick();
        if (!this.lengthCounter.isActive) this.stop();
    }

    protected tickSweep(): void {}

    protected tickEnvelope(): void {
        this.envelope?.tick();
    }

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
     * Starts the channel, if it isn't started already.
     */
    start(): void {
        if (this.enabled) return;
        // if (!this.isDACOn) return;

        this.enabled = true;
        this.onStateChange(true);
        console.warn("Channel started", this.constructor.name);
        // this.onStart();

        // Enabling in first half of length period should clock length
        // const timerBits = this.NRX1_LENGTH_TIMER_BITS;
        // const nrx1 = this.nrX1.get();
        // if ((nrx1 & timerBits) === 0) {
        //     this.nrX1.set((nrx1 & ~timerBits) | timerBits);
        //     if (this.step % 2 === 1) {
        //         this.tickLengthTimer();
        //     }
        // }
    }

    /**
     * Stops the channel, if it isn't stopped already.
     */
    stop(): void {
        if (!this.enabled) return;

        this.enabled = false;
        this.onStateChange(false);
        console.warn("Channel stopped", this.constructor.name);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
