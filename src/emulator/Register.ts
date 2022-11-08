import Addressable from "./Addressable";
import { wrap16 } from "./util";

/**
 * Half of a register, containing an 8bit value.
 * Note all additions/substractions to the register wrap (ie. 255 + 1 = 0).
 *
 * For convenience's sake, a register implements `Addressable`. Calling `read` will simply
 * return the value (ignoring the position), and calling `write` will simply set the value,
 * ignoring the position too.
 */
class SubRegister implements Addressable {
    protected value: number;

    /** Initialises a subregister with either 0 or a value */
    constructor(value?: number) {
        this.value = value ?? 0;
    }

    /** Sets this register byte to the given value */
    set(value: number) {
        this.value = value;
    }
    /** The value of this register byte */
    get() {
        return this.value;
    }
    /** Sets the given flag to 0/1 according to the boolean */
    sflag(flag: number, state: boolean) {
        this.value = state ? this.value | flag : this.value & ~flag;
    }
    /** Returns if the given flag is set */
    flag(flag: number) {
        return (this.value & flag) !== 0;
    }

    /** Read this subregister. */
    read(): number {
        return this.get();
    }
    /** Write to this subregister. Position's ignored. */
    write(_: number, data: number): void {
        this.set(data);
    }
}

/**
 * A register, containing two 8 bit values.
 */
class Register {
    // Most significant byte (0xFF00)
    public h = new SubRegister();
    // Least significant byte (0x00FF)
    public l = new SubRegister();

    /** Builds the register from either one 16-bit value or two 8-bit values */
    constructor(high: number, low?: number) {
        if (low !== undefined) {
            this.h.set(high);
            this.l.set(low);
        } else {
            this.set(high);
        }
    }

    /** Sets this register to the given 16bit value. */
    set(value: number) {
        this.h.set((value >> 8) & 0xff);
        this.l.set(value & 0xff);
    }

    /** Returns the 16bit value in this register */
    get() {
        return (this.h.get() << 8) | this.l.get();
    }

    /** Increments this register's value and returns the previous value (equivalent to r++) */
    inc() {
        const temp = this.get();
        this.set(wrap16(temp + 1));
        return temp;
    }

    /** Decrements this register's value and returns the previous value (equivalent to r--) */
    dec() {
        const temp = this.get();
        this.set(wrap16(temp - 1));
        return temp;
    }
}

export { Register, SubRegister };
