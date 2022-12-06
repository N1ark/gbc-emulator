import Addressable from "./Addressable";
import { IFLAG_TIMER } from "./constants";
import { Register, SubRegister } from "./Register";
import System from "./System";
import { Int2, wrap16 } from "./util";

/**
 * Represents the division applied to the clock speed depending on the value of the
 * first two bits of the TAC.
 * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html#ff07--tac-timer-control
 */
const TIMER_CONTROLS = {
    0b00: 9,
    0b01: 3,
    0b10: 5,
    0b11: 7,
};

/**
 * The TIMA counter only runs if this flag is true in the TAC.
 */
const TIMER_ENABLE_FLAG = 1 << 2;

class Timer implements Addressable {
    // DIV - divider register
    protected divider = new Register(0xab00);
    // TIMA - timer counter
    protected timerCounter = new SubRegister(0x00);
    // TMA - timer modulo
    protected timerModulo = new SubRegister(0x00);
    // TAC - timer control
    protected timerControl = new SubRegister(0xf8);

    protected previousDivider = this.divider.get();
    protected previousTimerControl = this.timerControl.get();
    protected timerOverflowed: boolean = false;
    protected previousTimerOverflowed: boolean = false;

    /**
     * Ticks the timer system in M-cycles
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(system: System) {
        // Store bit for TIMA edge-detection
        const speedMode = (this.timerControl.get() & 0b11) as Int2;
        const checkedBit = TIMER_CONTROLS[speedMode];
        const bitStateBefore = (this.previousDivider >> checkedBit) & 1;

        // Increase internal counter, update DIV
        this.divider.set(wrap16(this.divider.get() + 4));

        // Check overflow + interrupt
        this.previousTimerOverflowed = false;
        if (this.timerOverflowed) {
            const modulo = this.timerModulo.get();
            this.timerCounter.set(modulo);
            system.requestInterrupt(IFLAG_TIMER);
            this.timerOverflowed = false;
            this.previousTimerOverflowed = true;
        }

        // Increase TIMA
        // Several edge-y cases can toggle a timer increase:
        const bitStateAfter = (this.divider.get() >> checkedBit) & 1;
        const timerIsEnabled = this.timerControl.flag(TIMER_ENABLE_FLAG);
        const timerWasEnabled = (this.previousTimerControl & TIMER_ENABLE_FLAG) !== 0;
        let timerNeedsIncrease = false;

        // Regular falling edge, while toggled
        if (timerIsEnabled && bitStateBefore && !bitStateAfter) timerNeedsIncrease = true;
        // Bit is set, and timer went from enabled to disabled
        if (!timerIsEnabled && timerWasEnabled && bitStateBefore) timerNeedsIncrease = true;

        if (timerNeedsIncrease) {
            const result = this.timerCounter.get() + 1;
            // overflow, need to warn for reset + interrupt
            if (result > 0xff) {
                this.timerCounter.set(0);
                this.timerOverflowed = true;
            } else {
                this.timerCounter.set(result);
            }
        }

        this.previousTimerControl = this.timerControl.get();
        this.previousDivider = this.divider.get();
    }

    protected address(pos: number): SubRegister {
        const register = {
            0xff04: this.divider.h, // we only ever read the upper 8 bits of the divider
            0xff05: this.timerCounter,
            0xff06: this.timerModulo,
            0xff07: this.timerControl,
        }[pos];
        if (register) {
            return register;
        }
        throw new Error(`Invalid address given to timer: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        return this.address(pos).get();
    }

    write(pos: number, data: number): void {
        // Trying to write anything to DIV clears it.
        const register = this.address(pos);
        if (register === this.divider.h) {
            this.divider.set(0);
        } else if (register === this.timerControl) register.set(data | 0xf8); // 3 bits only
        else if (register === this.timerCounter) {
            // If overflow (reload) occurred, writes are ignored
            if (this.previousTimerOverflowed) return;
            this.timerOverflowed = false;
            register.set(data);
        } else register.set(data);
    }
}

export default Timer;
