import Addressable from "./Addressable";
import { CLOCK_SPEED, DIV_INC_RATE, IFLAG_TIMER } from "./constants";
import { SubRegister } from "./Register";
import System from "./System";
import { wrap8 } from "./util";

/**
 * Represents the division applied to the clock speed depending on the value of the
 * first two bits of the TAC.
 * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html#ff07--tac-timer-control
 */
const TIMER_CONTROLS = {
    0b00: 1024,
    0b01: 16,
    0b10: 64,
    0b11: 256,
};
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

    /**
     * Ticks the timer system
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(system: System) {
        // Increase DIV
        this.dividerSub++;
        if (this.dividerSub >= CLOCK_SPEED / DIV_INC_RATE) {
            this.dividerSub %= CLOCK_SPEED / DIV_INC_RATE;
            this.divider.set(wrap8(this.divider.get() + 1));
        }

        // Increase TIMA
        if (this.timerControl.flag(TIMER_ENABLE_FLAG)) {
            const speedMode = (this.timerControl.get() & 0b11) as keyof typeof TIMER_CONTROLS;
            const clockDivider = TIMER_CONTROLS[speedMode];
            this.timerCounterSub++;
            while (this.timerCounterSub >= clockDivider) {
                this.timerCounterSub -= clockDivider;
                const result = this.timerCounter.get() + 1;
                // overflow, need to interrupt + reset
                if (result > 0xff) {
                    this.timerCounter.set(this.timerModulo.get());
                    system.requestInterrupt(IFLAG_TIMER);
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
