import Addressable from "./Addressable";
import { CLOCK_SPEED, DIV_INC_RATE, IFLAG_TIMER } from "./constants";
import { SubRegister } from "./Register";
import System from "./System";
import { wrap16, wrap8 } from "./util";

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

type Int2 = 0 | 1 | 2 | 3;

/**
 * The TIMA counter only runs if this flag is true in the TAC.
 */
const TIMER_ENABLE_FLAG = 1 << 2;

class Timer implements Addressable {
    // DIV - divider register
    protected divider = new SubRegister(0xab);
    protected dividerSub = 0; // a helper counter
    // TIMA - timer counter
    protected timerCounter = new SubRegister(0x00);
    protected timerCounterSub = 0; // a helper counter
    // TMA - timer modulo
    protected timerModulo = new SubRegister(0x00);
    // TAC - timer control
    protected timerControl = new SubRegister(0xf8);

    protected timerOverflowed: boolean = false;

    /**
     * Ticks the timer system in M-cycles
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(system: System) {
        // Increase DIV
        this.dividerSub += 4;
        if (this.dividerSub >= CLOCK_SPEED / DIV_INC_RATE) {
            this.dividerSub %= CLOCK_SPEED / DIV_INC_RATE;
            this.divider.set(wrap8(this.divider.get() + 1));
        }

        // Check overflow + interrupt
        if (this.timerOverflowed) {
            const modulo = this.timerModulo.get();
            this.timerCounter.set(modulo);
            system.requestInterrupt(IFLAG_TIMER);
            this.timerOverflowed = false;
        }

        // Increase TIMA
        if (this.timerControl.flag(TIMER_ENABLE_FLAG)) {
            const speedMode = (this.timerControl.get() & 0b11) as Int2;
            const checkedBit = TIMER_CONTROLS[speedMode];

            const bitStateBefore = (this.timerCounterSub >> checkedBit) & 1;
            this.timerCounterSub = wrap16(this.timerCounterSub + 4);
            const bitStateAfter = (this.timerCounterSub >> checkedBit) & 1;

            if (bitStateBefore === 1 && bitStateAfter === 0) {
                const result = this.timerCounter.get() + 1;
                // overflow, need to interrupt + reset
                if (result > 0xff) {
                    this.timerCounter.set(0);
                    this.timerOverflowed = true;
                } else {
                    this.timerCounter.set(result);
                }
            }
        }
    }

    protected address(pos: number): SubRegister {
        const register = {
            0xff04: this.divider,
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
        if (register === this.divider) {
            register.set(0);
            this.dividerSub = 0;
            this.timerCounterSub = 0;
        } else register.set(data);
    }
}

export default Timer;
