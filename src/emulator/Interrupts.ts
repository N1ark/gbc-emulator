import { IFLAG_JOYPAD, IFLAG_LCDC, IFLAG_SERIAL, IFLAG_TIMER, IFLAG_VBLANK } from "./constants";
import { Addressable } from "./Memory";
import { MaskRegister, Register } from "./Register";

type IntMasterEnableStateType = "DISABLED" | "WILL_ENABLE" | "WILL_ENABLE2" | "ENABLED";

/**
 * The state of the IME.
 * We need two transition states, because the system ticks right after the CPU, so if we go
 * straight from WILL_ENABLE to ENABLED the CPU will never tick during a non-enabled state.
 */
const IntMasterEnableState: Record<IntMasterEnableStateType, IntMasterEnableStateType> = {
    DISABLED: "DISABLED",
    WILL_ENABLE: "WILL_ENABLE2",
    WILL_ENABLE2: "ENABLED",
    ENABLED: "ENABLED",
};

const INTERRUPT_CALLS: [number, number][] = [
    [IFLAG_VBLANK, 0x0040],
    [IFLAG_LCDC, 0x0048],
    [IFLAG_TIMER, 0x0050],
    [IFLAG_SERIAL, 0x0058],
    [IFLAG_JOYPAD, 0x0060],
];

class Interrupts implements Addressable {
    // Interrupts
    protected intMasterEnable: IntMasterEnableStateType = "DISABLED"; // IME - master enable flag
    protected intEnable = new Register(0x00); // IE - interrupt enable (handler)
    protected intFlag = new MaskRegister(0b1110_0000, 0xe1); // IF - interrupt flag (requests)

    protected addresses: Record<number, Register> = {
        0xffff: this.intEnable,
        0xff0f: this.intFlag,
    };

    tick(): void {
        // Tick IME
        this.intMasterEnable = IntMasterEnableState[this.intMasterEnable];
    }

    read(address: number): number {
        return this.addresses[address].get();
    }

    write(address: number, value: number): void {
        this.addresses[address].set(value);
    }

    get interruptsEnabled(): boolean {
        return this.intMasterEnable === "ENABLED";
    }

    /** Enables the master interrupt toggle. */
    enableInterrupts() {
        if (this.intMasterEnable === "DISABLED") this.intMasterEnable = "WILL_ENABLE";
    }
    /** Disables the master interrupt toggle. */
    disableInterrupts() {
        this.intMasterEnable = "DISABLED";
    }

    /**
     * Forces the transition to IME = enabled (needed when halting).
     * Returns the state of the IME: enabled (true) or disabled (false)
     */
    fastEnableInterrupts(): boolean {
        // forces transition
        if (this.intMasterEnable !== "DISABLED") {
            this.intMasterEnable = "ENABLED";
        }
        return this.intMasterEnable === "ENABLED";
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
        for (const [flag, address] of INTERRUPT_CALLS) {
            if (this.intEnable.flag(flag) && this.intFlag.flag(flag)) {
                this.intFlag.sflag(flag, false);
                this.disableInterrupts();
                return address;
            }
        }
        throw new Error("Cleared interrupt but nothing was called");
    }
}

export default Interrupts;
