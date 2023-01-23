import { Addressable } from "../Memory";
import { RegisterFF, SubRegister } from "../Register";
import { combine, high, low, u4 } from "../util";
import { ChannelCallback } from "./APU";

const FREQUENCY_SWEEP_PACE: u8 = 4;
const FREQUENCY_ENVELOPE: u8 = 8;
const FREQUENCY_LENGTH_TIMER: u8 = 2;

const NRX4_RESTART_CHANNEL: u8 = 1 << 7;
const NRX4_LENGTH_TIMER_FLAG: u8 = 1 << 6;

export abstract class SoundChannel implements Addressable {
    // Channel-dependent
    protected NRX1_LENGTH_TIMER_BITS: u8 = 0;

    // Common registers
    protected nrX0: SubRegister = RegisterFF;
    protected nrX1: SubRegister = RegisterFF;
    protected nrX2: SubRegister = RegisterFF;
    protected nrX3: SubRegister = RegisterFF;
    protected nrX4: SubRegister = RegisterFF;

    // State
    protected enabled: boolean = false;
    protected callback: ChannelCallback;

    // Counters
    protected lengthTimerCounter: number = 0;

    constructor(callback: ChannelCallback) {
        this.callback = callback;
    }

    /**
     * Ticks the whole channel. This method should not be overrided by subclasses - for ticking
     * behavior, override doTick instead.
     */
    tick(divChanged: boolean): void {
        // Ticks even when disabled
        if (divChanged) this.tickLengthTimer();

        if (!this.enabled) return;
        this.doTick(divChanged);
    }

    /**
     * Ticks the length timer.
     */
    private tickLengthTimer(): void {
        // Tick length timer
        if (++this.lengthTimerCounter >= FREQUENCY_LENGTH_TIMER) {
            this.lengthTimerCounter = 0;
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
    }

    /**
     * Ticks the channel. This method should be overrided by subclasses for channel-specific
     * behavior.
     * @param divChanged Whether the DIV has ticked (ie. bit 4 went from 1 to 0)
     */
    protected abstract doTick(divChanged: boolean): void;

    getOutput(): u4 {
        return this.enabled ? this.getSample() : 0;
    }

    /**
     * @returns The current value of the channel (value between 0-F).
     */
    protected abstract getSample(): u4;

    /**
     * @returns The channel's wavelength, using the NRX3 and NRX4 registers. Only relevant for
     * channels 1, 2 and 3.
     */
    protected getWavelength(): u16 {
        const lower8: u8 = this.nrX3.get();
        const higher3: u8 = this.nrX4.get() & 0b111;
        return combine(higher3, lower8);
    }

    /**
     * @param waveLength The new wavelength, using the NRX3 and NRX4 registers. Only relevant
     * for channels 1, 2 and 3.
     */
    protected setWavelength(waveLength: u16): void {
        waveLength &= 0x7ff; // ensure it fits in 11bits
        const lower8: u8 = low(waveLength);
        const higher3: u8 = high(waveLength);
        this.nrX3.set(lower8);
        this.nrX4.set((this.nrX4.get() & ~0b111) | higher3);
    }

    /**
     * Starts the channel, if it isn't started already.
     */
    start(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.callback.changed(true);
    }

    /**
     * Stops the channel, if it isn't stopped already.
     */
    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.callback.changed(false);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export { NRX4_RESTART_CHANNEL, FREQUENCY_SWEEP_PACE, FREQUENCY_ENVELOPE };
