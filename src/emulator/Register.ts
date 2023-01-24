import { Addressable } from "./Memory";
import { wrap16 } from "./util";

/**
 * Half of a register, containing an 8bit value.
 * Note all additions/substractions to the register wrap (ie. 255 + 1 = 0).
 *
 * For convenience's sake, a register implements `Addressable`. Calling `read` will simply
 * return the value (ignoring the position), and calling `write` will simply set the value,
 * ignoring the position too.
 */
class Register implements Addressable {
    protected value: number;

    /** Initialises a subregister with either 0 or a value */
    constructor(value: number = 0) {
        this.value = value;
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
        this.set(state ? this.value | flag : this.value & ~flag);
    }
    /** Returns if the given flag is set */
    flag(flag: number) {
        return (this.get() & flag) === flag;
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
 * A PaddedSubRegister is similar to a SubRegister but it only uses a set given of bits. All
 * other bits are hard-wired to 1, and can't be changed.
 * e.g. writing 0x02 to a PaddedSubRegister that has a 10000001 mask will actually write 0x83
 */
class MaskRegister extends Register {
    protected mask: number;

    /**
     * Constructs a PaddedSubRegister, using only the given number of bits
     * @param usedBits Either the number of used bits (the end / most significant will be
     * padded) or an array containing the mask of the subregister.
     * @param value The initial value of the register
     */
    constructor(mask: number, value: number = 0) {
        mask &= 0xff;
        super(value | mask);
        this.mask = mask;
    }

    override set(value: number): void {
        super.set(value | this.mask);
    }
}

/**
 * A register, containing two 8 bit values.
 */
class DoubleRegister {
    // Most significant byte (0xFF00)
    public h = new Register();
    // Least significant byte (0x00FF)
    public l = new Register();

    constructor(value: number = 0) {
        this.set(value);
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

const Register00: Addressable = { read: () => 0x00, write: () => {} };
const RegisterFF: Addressable = { read: () => 0xff, write: () => {} };

export { DoubleRegister, Register, MaskRegister, Register00, RegisterFF };
