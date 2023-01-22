import { IFLAG_TIMER } from "./constants";
import Interrupts from "./Interrupts";
import { Addressable } from "./Memory";
import { PaddedSubRegister, Register, SubRegister } from "./Register";
import { Int16Map, u2 } from "./util";

/**
 * Represents the division applied to the clock speed depending on the value of the
 * first two bits of the TAC.
 * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html#ff07--tac-timer-control
 */
const TIMER_CONTROLS: StaticArray<u8> = [9, 3, 5, 7];

/** The TIMA counter only runs if this flag is true in the TAC. */
const TIMER_ENABLE_FLAG: u8 = 1 << 2;

class Timer implements Addressable {
    // DIV - divider register
    protected divider: Register = new Register(0xab00);
    // TIMA - timer counter
    protected timerCounter: SubRegister = new SubRegister(0x00);
    // TMA - timer modulo
    protected timerModulo: SubRegister = new SubRegister(0x00);
    // TAC - timer control
    protected timerControl: SubRegister = new PaddedSubRegister(0b1111_1000);

    protected previousDivider: u16 = this.divider.get();
    protected previousTimerControl: u8 = this.timerControl.get();
    protected timerOverflowed: boolean = false;
    protected previousTimerOverflowed: boolean = false;

    protected addresses: Int16Map<SubRegister> = new Map<u16, SubRegister>();

    constructor() {
        this.addresses.set(0xff04, this.divider.h); // we only ever read the upper 8 bits of the divider
        this.addresses.set(0xff05, this.timerCounter);
        this.addresses.set(0xff06, this.timerModulo);
        this.addresses.set(0xff07, this.timerControl);
    }

    /**
     * Ticks the timer system in M-cycles
     * @link https://gbdev.io/pandocs/Timer_and_Divider_Registers.html
     */
    tick(interrupts: Interrupts): void {
        // Store bit for TIMA edge-detection
        const speedMode: u2 = this.timerControl.get() & 0b11;
        const checkedBit: u8 = TIMER_CONTROLS[speedMode];
        const bitStateBefore: bool = (this.previousDivider >> checkedBit) & 1;

        // Increase internal counter, update DIV
        const newDivider: u16 = this.divider.get() + 4;
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
        // Several edge-y cases can toggle a timer increase:
        const bitStateAfter = (newDivider >> checkedBit) & 1;
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
        this.previousDivider = newDivider;
    }

    read(pos: u16): u8 {
        return this.addresses.get(pos).get();
    }

    write(pos: u16, data: u8): void {
        // Trying to write anything to DIV clears it.
        const register = this.addresses.get(pos);
        if (register === this.divider.h) {
            data = 0;
        } else if (register === this.timerCounter) {
            // If overflow (reload) occurred, writes are ignored
            if (this.previousTimerOverflowed) return;
            this.timerOverflowed = false;
        }
        register.set(data);

        // If an overflow (reload) just happened, we update the value to the new modulo
        if (register === this.timerModulo && this.previousTimerOverflowed) {
            const newModulo = this.timerModulo.get();
            this.timerCounter.set(newModulo);
        }
    }
}

export default Timer;
