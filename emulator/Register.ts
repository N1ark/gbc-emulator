import { Addressable } from "./Memory";

/**
 * Half of a register, containing an 8bit value.
 * Note all additions/substractions to the register wrap (ie. 255 + 1 = 0).
 *
 * For convenience's sake, a register implements `Addressable`. Calling `read` will simply
 * return the value (ignoring the position), and calling `write` will simply set the value,
 * ignoring the position too.
 */
class SubRegister implements Addressable {
    protected value: u8;

    /** Initialises a subregister with either 0 or a value */
    constructor(value: u8 = 0) {
        this.value = value;
    }

    /** Sets this register byte to the given value */
    set(value: u8): void {
        this.value = value;
    }
    /** The value of this register byte */
    get(): u8 {
        return this.value;
    }
    /** Sets the given flag to 0/1 according to the boolean */
    sflag(flag: u8, state: boolean): void {
        this.set(state ? this.value | flag : this.value & ~flag);
    }
    /** Returns if the given flag is set */
    flag(flag: u8): boolean {
        return (this.get() & flag) === flag;
    }

    /** Read this subregister. */
    read(): u8 {
        return this.get();
    }
    /** Write to this subregister. Position's ignored. */
    write(_: u16, data: u8): void {
        this.set(data);
    }
}

/**
 * A PaddedSubRegister is similar to a SubRegister but it only uses a set given of bits. All
 * other bits are hard-wired to 1, and can't be changed.
 * e.g. writing 0x02 to a PaddedSubRegister that has a 10000001 mask will actually write 0x83
 */
class PaddedSubRegister extends SubRegister {
    protected mask: u8;

    /**
     * Constructs a PaddedSubRegister, using only the given number of bits
     * @param usedBits Either the number of used bits (the end / most significant will be
     * padded) or an array containing the mask of the subregister.
     * @param value The initial value of the register
     */
    constructor(mask: u8, value: u8 = 0) {
        mask &= 0xff;
        super(value | mask);
        this.mask = mask;
    }

    override set(value: u8): void {
        super.set(value | this.mask);
    }
}

/**
 * A register, containing two 8 bit values.
 */
class Register {
    // Most significant byte (0xFF00)
    public h: SubRegister = new SubRegister();
    // Least significant byte (0x00FF)
    public l: SubRegister = new SubRegister();

    /** Builds the register from either one 16-bit value or two 8-bit values */
    constructor(high: u16 = 0, low?: u8) {
        if (low !== undefined) {
            this.h.set(high as u8);
            this.l.set(low);
        } else {
            this.set(high);
        }
    }

    /** Sets this register to the given 16bit value. */
    set(value: u16): void {
        this.h.set(((value >> 8) & 0xff) as u8);
        this.l.set((value & 0xff) as u8);
    }

    /** Returns the 16bit value in this register */
    get(): u16 {
        return (this.h.get() << 8) | this.l.get();
    }

    /** Increments this register's value and returns the previous value (equivalent to r++) */
    inc(): u16 {
        const temp = this.get();
        this.set(temp + 1);
        return temp;
    }

    /** Decrements this register's value and returns the previous value (equivalent to r--) */
    dec(): u16 {
        const temp = this.get();
        this.set(temp - 1);
        return temp;
    }
}

class FixedRegister extends SubRegister {
    constructor(value: u8) {
        super(value);
    }

    override set(_: u16): void {}
    override sflag(flag: number, state: boolean): void {}
}

const Register00: FixedRegister = new FixedRegister(0x00);
const RegisterFF: FixedRegister = new FixedRegister(0xff);

export { Register, SubRegister, PaddedSubRegister, Register00, RegisterFF };
