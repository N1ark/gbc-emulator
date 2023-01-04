import Addressable from "../Addressable";
import { CLOCK_SPEED } from "../constants";
import { SubRegister } from "../Register";
import System from "../System";

const FREQUENCY_SWEEP_PACE = 4;
const FREQUENCY_ENVELOPE = 8;
const FREQUENCY_LENGTH_TIMER = 2;

const DIV_TICK_BIT = 1 << 4;

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
    protected oldDivBitState = false;

    // Counters
    protected lengthTimerCounter: number = 0;

    constructor(onStateChange: (state: boolean) => void) {
        this.onStateChange = onStateChange;
    }

    /**
     * Ticks the whole channel. This method should not be overrided by subclasses - for ticking
     * behavior, override doTick instead.
     */
    tick(system: System): void {
        const divBitState = (system.read(0xff04) & DIV_TICK_BIT) === DIV_TICK_BIT;
        const divChanged = !divBitState && this.oldDivBitState;
        this.oldDivBitState = divBitState;

        // Ticks even when disabled
        this.tickLengthTimer(divChanged);

        if (!this.enabled) return;
        this.doTick(divChanged);
    }

    /**
     * Ticks the length timer.
     */
    private tickLengthTimer(divChanged: boolean): void {
        // Tick length timer
        if (divChanged && ++this.lengthTimerCounter >= FREQUENCY_LENGTH_TIMER) {
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
    protected doTick(divChanged: boolean): void {}

    /**
     * @returns The current value of the channel.
     */
    abstract getSample(): number;

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
    start(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.onStateChange(true);
    }

    /**
     * Stops the channel, if it isn't stopped already.
     */
    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.onStateChange(false);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
export { NRX4_RESTART_CHANNEL, FREQUENCY_SWEEP_PACE, FREQUENCY_ENVELOPE };