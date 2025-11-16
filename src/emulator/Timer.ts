import { IFLAG_TIMER } from "./constants";
import Interrupts from "./Interrupts";
import { Addressable } from "./Memory";
import { DoubleRegister, MaskRegister, Register } from "./Register";
import { Int2, wrap16 } from "./util";

/**
 * Represents the division applied to the clock speed depending on the value of the
 * first two bits of the TAC.
 * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html#ff07--tac-timer-control
 */
const TIMER_CONTROLS = [9, 3, 5, 7];

/**
 * The TIMA counter only runs if this flag is true in the TAC.
 */
const TIMER_ENABLE_FLAG = 1 << 2;

class Timer implements Addressable {
    // DIV - divider register
    protected divider = new DoubleRegister(0xab00);
    // TIMA - timer counter
    protected timerCounter = new Register();
    // TMA - timer modulo
    protected timerModulo = new Register();
    // TAC - timer control
    protected timerControl = new MaskRegister(0b1111_1000);

    protected previousBitState: number = 0;
    protected timerOverflowed: boolean = false;
    protected previousTimerOverflowed: boolean = false;

    /**
     * Ticks the timer system in M-cycles
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(interrupts: Interrupts) {
        // Increase internal counter, update DIV
        const newDivider = wrap16(this.divider.get() + 4);
        this.divider.set(newDivider);

        // Check overflow + interrupt
        this.previousTimerOverflowed = false;
        if (this.timerOverflowed) {
            const modulo = this.timerModulo.get();
            this.timerCounter.set(modulo);
            interrupts.requestInterrupt(IFLAG_TIMER);
            this.timerOverflowed = false;
            this.previousTimerOverflowed = true;
        }

        // Increase TIMA
        // Store bit for TIMA edge-detection
        const timerControl = this.timerControl.get();
        const timerIsEnabled = timerControl & TIMER_ENABLE_FLAG;
        const speedMode = (timerControl & 0b11) as Int2;
        const checkedBit = TIMER_CONTROLS[speedMode];

        // Bit is read if enabled, otherwise it's 0
        const currentBitState = timerIsEnabled && (newDivider >> checkedBit) & 1;

        // Timer increases when *read bit* goes from 1 to 0
        // This meaning turning off the timer when the bit was 1 triggers an increase
        if (this.previousBitState && !currentBitState) {
            const result = (this.timerCounter.get() + 1) & 0xff;
            this.timerCounter.set(result);

            // overflow, need to warn for reset + interrupt
            if (result === 0) {
                this.timerOverflowed = true;
            }
        }

        this.previousBitState = currentBitState;
    }

    protected addresses: Record<number, Register> = {
        0xff04: this.divider.h, // we only ever read the upper 8 bits of the divider
        0xff05: this.timerCounter,
        0xff06: this.timerModulo,
        0xff07: this.timerControl,
    };

    read(pos: number): number {
        return this.addresses[pos].get();
    }

    write(pos: number, data: number): void {
        // Trying to write anything to DIV clears it.
        if (pos === 0xff04) {
            this.divider.set(0);
            return;
        }

        const register = this.addresses[pos];

        if (register === this.timerCounter) {
            // If overflow (reload) occurred, writes are ignored
            if (this.previousTimerOverflowed) return;
            // Otherwise it negates the overflow flag
            this.timerOverflowed = false;
        }
        // If an overflow (reload) just happened, we update the value to the new modulo
        else if (register === this.timerModulo && this.previousTimerOverflowed) {
            this.timerCounter.set(data);
        }

        register.set(data);
    }
}

export default Timer;
