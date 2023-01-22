import { IFLAG_JOYPAD, IFLAG_LCDC, IFLAG_SERIAL, IFLAG_TIMER, IFLAG_VBLANK } from "./constants";
import { Addressable } from "./Memory";
import { PaddedSubRegister, SubRegister } from "./Register";

/**
 * The state of the IME.
 * We need two transition states, because the system ticks right after the CPU, so if we go
 * straight from WILL_ENABLE to ENABLED the CPU will never tick during a non-enabled state.
 */
enum IMEState {
    DISABLED,
    WILL_ENABLE,
    WILL_ENABLE2,
    ENABLED,
}

const IMEStateTransition: Map<IMEState, IMEState> = new Map();
IMEStateTransition.set(IMEState.DISABLED, IMEState.DISABLED);
IMEStateTransition.set(IMEState.WILL_ENABLE, IMEState.WILL_ENABLE2);
IMEStateTransition.set(IMEState.WILL_ENABLE2, IMEState.ENABLED);
IMEStateTransition.set(IMEState.ENABLED, IMEState.ENABLED);

const INTERRUPT_CALLS: StaticArray<i8> = [
    IFLAG_VBLANK,
    0x0040,
    IFLAG_LCDC,
    0x0048,
    IFLAG_TIMER,
    0x0050,
    IFLAG_SERIAL,
    0x0058,
    IFLAG_JOYPAD,
    0x0060,
];

class Interrupts implements Addressable {
    // Interrupts
    // IME - master enable flag
    protected intMasterEnable: IMEState = IMEState.DISABLED;
    // IE - interrupt enable (handler)
    protected intEnable: SubRegister = new SubRegister(0x00);
    // IF - interrupt flag (requests)
    protected intFlag: SubRegister = new PaddedSubRegister(0b1110_0000, 0xe1);

    tick(): void {
        // Tick IME
        this.intMasterEnable = IMEStateTransition.get(this.intMasterEnable);
    }

    protected address(address: u16): Addressable {
        switch (address) {
            case 0xffff:
                return this.intEnable;
            case 0xff0f:
                return this.intFlag;
            default:
                throw new Error(`Invalid interrupt address: ${address}`);
        }
    }

    read(address: u16): u8 {
        return this.address(address).read(address);
    }

    write(address: u16, data: u8): void {
        this.address(address).write(address, data);
    }

    get interruptsEnabled(): boolean {
        return this.intMasterEnable === IMEState.ENABLED;
    }

    /** Enables the master interrupt toggle. */
    enableInterrupts(): void {
        if (this.intMasterEnable === IMEState.DISABLED)
            this.intMasterEnable = IMEState.WILL_ENABLE;
    }
    /** Disables the master interrupt toggle. */
    disableInterrupts(): void {
        this.intMasterEnable = IMEState.DISABLED;
    }

    /**
     * Forces the transition to IME = enabled (needed when halting).
     * Returns the state of the IME: enabled (true) or disabled (false)
     */
    fastEnableInterrupts(): boolean {
        // forces transition
        if (this.intMasterEnable !== IMEState.DISABLED) {
            this.intMasterEnable = IMEState.ENABLED;
        }
        return this.intMasterEnable === IMEState.ENABLED;
    }

    /** Requests an interrupt for the given flag type. */
    requestInterrupt(flag: u8): void {
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
    handleNextInterrupt(): u16 {
        for (let i: u8 = 0; i < INTERRUPT_CALLS.length; i += 2) {
            const flag: u8 = INTERRUPT_CALLS[i];
            if (this.intEnable.flag(flag) && this.intFlag.flag(flag)) {
                const address: u16 = <u16>INTERRUPT_CALLS[i + 1];
                this.intFlag.sflag(flag, false);
                this.disableInterrupts();
                return address;
            }
        }
        throw new Error("Cleared interrupt but nothing was called");
    }
}

export default Interrupts;
