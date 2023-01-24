import { IFLAG_JOYPAD, IFLAG_LCDC, IFLAG_SERIAL, IFLAG_TIMER, IFLAG_VBLANK } from "./constants";
import { Addressable } from "./Memory";
import { MaskRegister, Register } from "./Register";

/** The state of the IME. */
enum IMEType {
    DISABLED,
    WILL_ENABLE,
    WILL_ENABLE2,
    ENABLED,
}

/**
 * Transition for the IME. We need two intermediate, because the system ticks right after the CPU, so if we go
 * straight from WILL_ENABLE to ENABLED the CPU will never tick during a non-enabled state.
 */
const IMETransitions: Record<IMEType, IMEType> = {
    [IMEType.DISABLED]: IMEType.DISABLED,
    [IMEType.WILL_ENABLE]: IMEType.WILL_ENABLE2,
    [IMEType.WILL_ENABLE2]: IMEType.ENABLED,
    [IMEType.ENABLED]: IMEType.ENABLED,
};

const IFLAGS = [IFLAG_VBLANK, IFLAG_LCDC, IFLAG_TIMER, IFLAG_SERIAL, IFLAG_JOYPAD];

/**
 * Mapping of interrupt flags to their corresponding interrupt handler address.
 */
const INTERRUPT_CALLS: Record<number, number> = {
    [IFLAG_VBLANK]: 0x0040,
    [IFLAG_LCDC]: 0x0048,
    [IFLAG_TIMER]: 0x0050,
    [IFLAG_SERIAL]: 0x0058,
    [IFLAG_JOYPAD]: 0x0060,
};

class Interrupts implements Addressable {
    // Interrupts
    protected intMasterEnable: IMEType = IMEType.DISABLED; // IME - master enable flag
    protected intEnable = new Register(0x00); // IE - interrupt enable (handler)
    protected intFlag = new MaskRegister(0b1110_0000, 0xe1); // IF - interrupt flag (requests)

    protected addresses: Record<number, Register> = {
        0xffff: this.intEnable,
        0xff0f: this.intFlag,
    };

    tick(): void {
        // Tick IME
        this.intMasterEnable = IMETransitions[this.intMasterEnable];
    }

    read(address: number): number {
        return this.addresses[address].get();
    }

    write(address: number, value: number): void {
        this.addresses[address].set(value);
    }

    get interruptsEnabled(): boolean {
        return this.intMasterEnable === IMEType.ENABLED;
    }

    /** Enables the master interrupt toggle. */
    enableInterrupts() {
        if (this.intMasterEnable === IMEType.DISABLED)
            this.intMasterEnable = IMEType.WILL_ENABLE;
    }
    /** Disables the master interrupt toggle. */
    disableInterrupts() {
        this.intMasterEnable = IMEType.DISABLED;
    }

    /**
     * Forces the transition to IME = enabled (needed when halting).
     * Returns the state of the IME: enabled (true) or disabled (false)
     */
    fastEnableInterrupts(): boolean {
        // forces transition
        if (this.intMasterEnable !== IMEType.DISABLED) {
            this.intMasterEnable = IMEType.ENABLED;
        }
        return this.intMasterEnable === IMEType.ENABLED;
    }

    /** Requests an interrupt for the given flag type. */
    requestInterrupt(flag: number) {
        this.intFlag.sflag(flag, true);
    }

    /** Returns whether there are any interrupts to handle. (IE & IF) */
    get hasPendingInterrupt(): boolean {
        return !!(this.intEnable.get() & this.intFlag.get() & 0b11111);
    }

    /**
     * Returns the address for the current interrupt handler. This also disables interrupts, and
     * clears the interrupt flag.
     */
    handleNextInterrupt(): number {
        for (const flag of IFLAGS) {
            if (this.intEnable.flag(flag) && this.intFlag.flag(flag)) {
                this.intFlag.sflag(flag, false);
                this.disableInterrupts();
                return INTERRUPT_CALLS[flag];
            }
        }
        throw new Error("Cleared interrupt but nothing was called");
    }
}

export default Interrupts;
