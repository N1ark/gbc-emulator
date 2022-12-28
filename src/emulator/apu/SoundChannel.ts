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

    tick(system: System): void {
        const divBitState = (system.read(0xff04) & DIV_TICK_BIT) === DIV_TICK_BIT;
        const divChanged = !divBitState && this.oldDivBitState;
        this.oldDivBitState = divBitState;

        // Ticks even when disabled
        this.tickLengthTimer(divChanged);

        if (!this.enabled) return;
        this.doTick(divChanged);
    }

    private tickLengthTimer(divChanged: boolean): void {
        // Tick length timer
        if (divChanged && ++this.lengthTimerCounter >= FREQUENCY_LENGTH_TIMER) {
            this.lengthTimerCounter = 0;
            if (this.nrX4.flag(NRX4_LENGTH_TIMER_FLAG)) {
                const timerBits = this.NRX1_LENGTH_TIMER_BITS;
                const nrx1 = this.nrX1.get();
                console.log(`Length timer: bits ${timerBits} / state ${nrx1 & timerBits}`);
                const lengthTimer = ((nrx1 & timerBits) + 1) & timerBits;
                this.nrX1.set((nrx1 & ~timerBits) | lengthTimer);
                // overflowed
                if (lengthTimer === 0) {
                    this.stop();
                }
            }
        }
    }

    protected doTick(divChanged: boolean): void {}

    abstract getSample(): number;

    start(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.onStateChange(true);
    }

    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.onStateChange(false);
        console.warn(`Stopped channel ${this.constructor.name}`);
    }

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
export { NRX4_RESTART_CHANNEL, FREQUENCY_SWEEP_PACE, FREQUENCY_ENVELOPE };
