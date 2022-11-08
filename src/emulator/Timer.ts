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
    protected timDivider = new SubRegister(0x00);
    protected timDividerSub = 0; // a helper counter
    // TIMA - timer counter
    protected timCounter = new SubRegister(0x00);
    protected timCounterSub = 0; // a helper counter
    // TMA - timer modulo
    protected timModulo = new SubRegister(0x00);
    // TAC - timer control
    protected timControl = new SubRegister(0x00);

    /**
     * Ticks the timer system
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(cycles: number, system: System) {
        // Increase DIV
        this.timDividerSub += cycles;
        if (this.timDividerSub >= CLOCK_SPEED / DIV_INC_RATE) {
            this.timDividerSub %= CLOCK_SPEED / DIV_INC_RATE;
            this.timDivider.set(wrap8(this.timDivider.get() + 1));
        }

        // Increase TIMA
        if (this.timControl.flag(TIMER_ENABLE_FLAG)) {
            const speedMode = (this.timControl.get() & 0b11) as keyof typeof TIMER_CONTROLS;
            const clockDivider = TIMER_CONTROLS[speedMode];
            this.timCounterSub += cycles;
            if (this.timCounterSub >= CLOCK_SPEED / clockDivider) {
                this.timCounterSub %= CLOCK_SPEED / clockDivider;
                const result = this.timCounter.get() + 1;
                // overflow, need to interrupt + reset
                if (result <= 0xff) {
                    this.timCounter.set(this.timModulo.get());
                    system.requestInterrupt(IFLAG_TIMER);
                } else {
                    this.timCounter.set(result);
                }
            }
        } else {
            this.timCounterSub = 0;
        }
    }

    protected address(pos: number): SubRegister {
        const adresses: Partial<Record<number, SubRegister>> = {
            0xff04: this.timDivider,
            0xff05: this.timCounter,
            0xff06: this.timModulo,
            0xff07: this.timControl,
        };
        const register = adresses[pos];
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
        if (register === this.timDivider) register.set(0);
        else register.set(data);
    }
}

export default Timer;
