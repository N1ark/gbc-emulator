import Interrupts from "./Interrupts";
import { Addressable } from "./Memory";
import { DoubleRegister, Register } from "./Register";
import { asSignedInt8, combine, high, low, wrap16, wrap8 } from "./util";

const FLAG_ZERO = 1 << 7;
const FLAG_SUBSTRACTION = 1 << 6;
const FLAG_HALFCARRY = 1 << 5;
const FLAG_CARRY = 1 << 4;

type InstructionMethod = (system: Addressable, interrupts: Interrupts) => InstructionReturn;
type InstructionReturn = InstructionMethod | null;

/**
 * The CPU of the GBC, responsible for reading the code and executing instructions.
 */
class CPU {
    // All registers are 16 bits long.
    // AF: lower is flags: ZNHC (zero, substraction, half-carry, carry)
    protected regAF = new DoubleRegister();
    protected regBC = new DoubleRegister();
    protected regDE = new DoubleRegister();
    protected regHL = new DoubleRegister();
    protected regPC = new DoubleRegister(); // program counter
    protected regSP = new DoubleRegister(); // stack pointer

    // If the CPU is halted
    protected halted: boolean = false;
    // If the CPU was halted when IME=0
    protected haltBug: boolean = false;

    // 8-bit registers, for convenience sake
    protected srA = this.regAF.h;
    protected srB = this.regBC.h;
    protected srC = this.regBC.l;
    protected srD = this.regDE.h;
    protected srE = this.regDE.l;
    protected srH = this.regHL.h;
    protected srL = this.regHL.l;

    // Next instruction callable
    protected nextStep: InstructionMethod | null = null;

    // The opcode for the next instruction
    // This is needed because the CPU actually fetches the opcode on the last M-cycle of the
    // previous instruction. This emulator stores the value at the PC at the end of each
    // instruction to use for the next instruction (this opcode is invalidated if an interrupt
    // happens)
    protected currentOpcode: number | null = null;

    // for debug purposes
    protected stepCounter: number = 0;

    // STOP instruction - relies on the rest of the system to stop
    protected stopInstruction: () => void;

    constructor(stopInstruction: () => void) {
        this.stopInstruction = stopInstruction;
    }

    // Returns the next opcode
    protected nextOpCode(system: Addressable): number {
        if (this.currentOpcode === null) {
            return system.read(this.regPC.inc());
        }
        const op = this.currentOpcode;
        this.currentOpcode = null;
        return op;
    }

    /**
     * Reads the given address and returns it to the receiver.
     * Takes 1 cycle.
     */
    protected readAddress(
        address: number | (() => number),
        receiver: (value: number) => InstructionMethod
    ): InstructionMethod {
        return (system) => {
            const effectiveAddress = typeof address === "number" ? address : address();
            const value = system.read(effectiveAddress);
            return receiver(value);
        };
    }

    /**
     * Reads the next byte from the PC and increases it.
     * Takes 1 cycle.
     */
    protected nextByte(receiver: (value: number) => InstructionMethod): InstructionMethod {
        return (system) => {
            const value = system.read(this.regPC.inc());
            return receiver(value);
        };
    }

    /**
     * Reads the next word (two bytes) from the PC and increases it.
     * Takes 2 cycles.
     */
    protected nextWord(receiver: (value: number) => InstructionMethod): InstructionMethod {
        return this.nextByte((low) => this.nextByte((high) => receiver(combine(high, low))));
    }

    /**
     * Steps through one line of the code, and returns the M-cycles required for the
     * operation
     * @param system The system to execute the instruction on
     * @param verbose If true, prints the executed instruction to the console
     * @returns true if the CPU is in a "set" state (ie. it's halted or just finished an
     * instruction), false if it is mid-instruction.
     */
    step(system: Addressable, interrupts: Interrupts, verbose?: boolean): boolean {
        if (this.nextStep === null) {
            const nextStep = this.loadNextOp(system, interrupts, verbose);
            if (nextStep === "halted") return true;
            this.nextStep = nextStep;
        }

        this.nextStep = this.nextStep(system, interrupts);
        if (this.nextStep === null) {
            this.currentOpcode = system.read(this.regPC.inc());
        }
        return this.nextStep === null;
    }

    protected loadNextOp(
        system: Addressable,
        interrupts: Interrupts,
        verbose?: boolean
    ): InstructionMethod | "halted" {
        // Check if any interrupt is requested. This also stops HALTing.
        if (interrupts.hasPendingInterrupt) {
            this.halted = false;
            if (interrupts.interruptsEnabled) {
                const execNext = interrupts.handleNextInterrupt();
                // Interrupt handling takes 5 cycles
                const nextStep = () => () => this.call(execNext, () => null);
                this.currentOpcode = null;
                this.regPC.dec(); // undo the read done at the end of the previous instruction
                if (verbose)
                    console.log("[CPU] interrupt execute, goto", execNext.toString(16));
                return nextStep;
            }
        }

        // Do nothing if halted
        if (this.halted) {
            return "halted";
        }

        // Execute next instruction
        const opcode = this.nextOpCode(system);
        ++this.stepCounter;
        if (verbose)
            console.log(
                `[CPU] ${this.stepCounter} - (0x${(this.regPC.get() - 1).toString(
                    16
                )}) executing op 0x${opcode.toString(16)}`
            );

        if (this.haltBug) {
            this.haltBug = false;
            this.regPC.dec();
        }

        const instruction = this.instructionSet[opcode];
        if (instruction === undefined) {
            throw Error(
                `Unrecognized opcode ${opcode?.toString(16)} at address ${(
                    this.regPC.get() - 1
                ).toString(16)}`
            );
        }
        return instruction;
    }

    /**
     * A list of all 8-bit opcodes.
     * Each callable executes the instruction, and returns the number of M-cycles that the
     * instruction took.
     * @link https://meganesulli.com/generate-gb-opcodes/
     * */
    protected instructionSet: Partial<Record<number, InstructionMethod>> = {
        // NOP
        0x00: () => null,
        // STOP
        0x10: () => {
            this.stopInstruction();
            return null;
        },
        // extended instructions
        0xcb: this.nextByte((opcode) => (system, interrupts) => {
            const instruction = this.extendedInstructionSet[opcode];
            if (instruction === undefined) {
                throw Error(
                    `Unrecognized extended opcode ${opcode.toString(16)} at address ${(
                        this.regPC.get() - 1
                    ).toString(16)}`
                );
            }
            return instruction(system, interrupts);
        }),
        // LD BC/DE/HL/SP, d16
        ...this.generateOperation(
            {
                0x01: this.regBC,
                0x11: this.regDE,
                0x21: this.regHL,
                0x31: this.regSP,
            },
            (register) =>
                this.nextWord((value) => () => {
                    register.set(value);
                    return null;
                })
        ),
        // INC BC/DE/HL/SP
        ...this.generateOperation(
            {
                0x03: this.regBC,
                0x13: this.regDE,
                0x23: this.regHL,
                0x33: this.regSP,
            },
            (r) => () => () => {
                r.inc();
                return null;
            }
        ),
        // DEC BC/DE/HL/SP
        ...this.generateOperation(
            {
                0x0b: this.regBC,
                0x1b: this.regDE,
                0x2b: this.regHL,
                0x3b: this.regSP,
            },
            (r) => () => () => {
                r.dec();
                return null;
            }
        ),
        // ADD HL, BC/DE/HL/SP
        ...this.generateOperation(
            {
                0x09: this.regBC,
                0x19: this.regDE,
                0x29: this.regHL,
                0x39: this.regSP,
            },
            (register) => () => () => {
                const hl = this.regHL.get();
                const n = register.get();
                const result = wrap16(hl + n);
                this.regHL.set(result);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, (((hl & 0xfff) + (n & 0xfff)) & 0x1000) != 0);
                this.setFlag(FLAG_CARRY, hl > 0xffff - n);
                return null;
            }
        ),
        // INC B/D/H/C/E/L/A
        ...this.generateOperation(
            {
                0x04: this.srB,
                0x0c: this.srC,
                0x14: this.srD,
                0x1c: this.srE,
                0x24: this.srH,
                0x2c: this.srL,
                0x3c: this.srA,
            },
            (r) => () => {
                const result = this.incN(r.get());
                r.set(result);
                return null;
            }
        ),
        // INC (HL)
        0x34: this.readAddress(
            () => this.regHL.get(),
            (value) => (s) => {
                const result = this.incN(value);
                s.write(this.regHL.get(), result);
                return () => null;
            }
        ),
        // DEC B/D/H/C/E/L/A
        ...this.generateOperation(
            {
                0x05: this.srB,
                0x0d: this.srC,
                0x15: this.srD,
                0x1d: this.srE,
                0x25: this.srH,
                0x2d: this.srL,
                0x3d: this.srA,
            },
            (r) => () => {
                const result = this.decN(r.get());
                r.set(result);
                return null;
            }
        ),
        // DEC (HL)
        0x35: this.readAddress(
            () => this.regHL.get(),
            (value) => (s) => {
                const result = this.decN(value);
                s.write(this.regHL.get(), result);
                return () => null;
            }
        ),
        // LD (BC/DE/HL+/HL-), A
        ...this.generateOperation(
            {
                0x02: () => this.regBC.get(),
                0x12: () => this.regDE.get(),
                0x22: () => this.regHL.inc(),
                0x32: () => this.regHL.dec(),
            },
            (getAddress) => (system) => {
                const address = getAddress();
                system.write(address, this.srA.get());
                return () => null;
            }
        ),
        // LD A, (BC/DE/HL+/HL-)
        ...this.generateOperation(
            {
                0x0a: () => this.regBC.get(),
                0x1a: () => this.regDE.get(),
                0x2a: () => this.regHL.inc(),
                0x3a: () => this.regHL.dec(),
            },
            (getAddress) =>
                this.readAddress(getAddress, (value) => () => {
                    this.srA.set(value);
                    return null;
                })
        ),
        // LD B/C/D/E/H/L/A, d8
        ...this.generateOperation(
            {
                0x06: this.srB,
                0x0e: this.srC,
                0x16: this.srD,
                0x1e: this.srE,
                0x26: this.srH,
                0x2e: this.srL,
                0x3e: this.srA,
            },
            (r) =>
                this.nextByte((value) => () => {
                    r.set(value);
                    return null;
                })
        ),
        // LD (HL), d8
        0x36: this.nextByte((value) => (s) => {
            s.write(this.regHL.get(), value);
            return () => null;
        }),
        // LD (a16), SP
        0x08: this.nextWord((value) => (s) => {
            s.write(value, this.regSP.l.get());
            return () => {
                s.write(value + 1, this.regSP.h.get());
                return () => null;
            };
        }),
        // LD B/C/D/E/H/L/A, B/C/D/E/H/L/A
        ...[this.srB, this.srC, this.srD, this.srE, this.srH, this.srL].reduce(
            (prev, r, i) => ({
                ...prev,
                ...this.generateExtendedOperation(0x40 + i * 8, ({ get, set }) =>
                    get((n) => {
                        r.set(n);
                        return null;
                    })
                ),
            }),
            {} as Partial<Record<number, InstructionMethod>>
        ),
        ...this.generateExtendedOperation(0x78, ({ get, set }) =>
            get((n) => {
                this.srA.set(n);
                return null;
            })
        ),
        // LD B/C/D/E/H/L/A (HL)
        ...this.generateOperation(
            {
                0x46: this.srB,
                0x4e: this.srC,
                0x56: this.srD,
                0x5e: this.srE,
                0x66: this.srH,
                0x6e: this.srL,
                0x7e: this.srA,
            },
            (r) =>
                this.readAddress(
                    () => this.regHL.get(),
                    (value) => {
                        r.set(value);
                        return () => null;
                    }
                )
        ),
        // LD (HL), B/C/D/E/H/L/A
        ...this.generateOperation(
            {
                0x70: this.srB,
                0x71: this.srC,
                0x72: this.srD,
                0x73: this.srE,
                0x74: this.srH,
                0x75: this.srL,
                0x77: this.srA,
            },
            (r) => (system) => {
                const address = this.regHL.get();
                system.write(address, r.get());
                return () => null;
            }
        ),
        // ADD A, B/C/D/E/H/L/A/(HL)/d8
        ...this.generateExtendedOperation(0x80, ({ get, set }) =>
            get((n) => {
                this.addNToA(n, false);
                return null;
            })
        ),

        0xc6: this.nextByte((value) => () => {
            this.addNToA(value, false);
            return null;
        }),
        // ADDC A, B/C/D/E/H/L/A/(HL)/d8
        ...this.generateExtendedOperation(0x88, ({ get, set }) =>
            get((n) => {
                this.addNToA(n, true);
                return null;
            })
        ),
        0xce: this.nextByte((value) => () => {
            this.addNToA(value, true);
            return null;
        }),
        // SUB A, B/C/D/E/H/L/A/(HL)/d8
        ...this.generateExtendedOperation(0x90, ({ get, set }) =>
            get((n) => {
                this.subNFromA(n, false);
                return null;
            })
        ),
        0xd6: this.nextByte((value) => () => {
            this.subNFromA(value, false);
            return null;
        }),
        // SBC A, B/C/D/E/H/L/A/(HL)/d8
        ...this.generateOperation(
            {
                0x98: this.srB,
                0x99: this.srC,
                0x9a: this.srD,
                0x9b: this.srE,
                0x9c: this.srH,
                0x9d: this.srL,
                0x9f: this.srA,
            },
            (r) => () => {
                this.subNFromA(r.get(), true);
                return null;
            }
        ),
        0x9e: this.readAddress(
            () => this.regHL.get(),
            (value) => () => {
                this.subNFromA(value, true);
                return null;
            }
        ),
        0xde: this.nextByte((value) => () => {
            this.subNFromA(value, true);
            return null;
        }),
        // AND/XOR/OR B/C/D/E/H/L/A
        ...this.generateOperation<number, [Register, "&" | "|" | "^"]>(
            {
                0xa0: [this.srB, "&"],
                0xa1: [this.srC, "&"],
                0xa2: [this.srD, "&"],
                0xa3: [this.srE, "&"],
                0xa4: [this.srH, "&"],
                0xa5: [this.srL, "&"],
                0xa7: [this.srA, "&"],

                0xa8: [this.srB, "^"],
                0xa9: [this.srC, "^"],
                0xaa: [this.srD, "^"],
                0xab: [this.srE, "^"],
                0xac: [this.srH, "^"],
                0xad: [this.srL, "^"],
                0xaf: [this.srA, "^"],

                0xb0: [this.srB, "|"],
                0xb1: [this.srC, "|"],
                0xb2: [this.srD, "|"],
                0xb3: [this.srE, "|"],
                0xb4: [this.srH, "|"],
                0xb5: [this.srL, "|"],
                0xb7: [this.srA, "|"],
            },
            ([r, op]) =>
                () => {
                    this.boolNToA(r.get(), op);
                    return null;
                }
        ),
        // AND/XOR/OR (HL)
        ...this.generateOperation(
            {
                0xa6: "&" as const,
                0xae: "^" as const,
                0xb6: "|" as const,
            },
            (op) =>
                this.readAddress(
                    () => this.regHL.get(),
                    (value) => () => {
                        this.boolNToA(value, op);
                        return null;
                    }
                )
        ),
        // AND/XOR/OR d8
        ...this.generateOperation(
            {
                0xe6: "&" as const,
                0xee: "^" as const,
                0xf6: "|" as const,
            },
            (op) =>
                this.nextByte((value) => () => {
                    this.boolNToA(value, op);
                    return null;
                })
        ),
        // CP B/C/D/E/H/L/A/(HL)/d8
        ...this.generateOperation(
            {
                0xb8: this.srB,
                0xb9: this.srC,
                0xba: this.srD,
                0xbb: this.srE,
                0xbc: this.srH,
                0xbd: this.srL,
                0xbf: this.srA,
            },
            (r) => () => {
                this.compNToA(r.get());
                return null;
            }
        ),
        0xbe: this.readAddress(
            () => this.regHL.get(),
            (value) => () => {
                this.compNToA(value);
                return null;
            }
        ),
        0xfe: this.nextByte((value) => (s) => {
            this.compNToA(value);
            return null;
        }),
        // LD (a8), A
        0xe0: this.nextByte((address) => (system) => {
            const value = this.srA.get();
            system.write(0xff00 | address, value);
            return () => null;
        }),
        // LD A, (a8)
        0xf0: this.nextByte((address) =>
            this.readAddress(0xff00 | address, (data) => () => {
                this.srA.set(data);
                return null;
            })
        ),
        // LD (C), A
        0xe2: (s) => {
            s.write(0xff00 | this.srC.get(), this.srA.get());
            return () => null;
        },
        // LD A, (C)
        0xf2: this.readAddress(
            () => 0xff00 | this.srC.get(),
            (value) => () => {
                this.srA.set(value);
                return null;
            }
        ),
        // LD (a16), A
        0xea: this.nextWord((address) => (system) => {
            const value = this.srA.get();
            system.write(address, value);
            return () => null;
        }),
        // LD A, (a16)
        0xfa: this.nextWord((value) => (s) => {
            const address = s.read(value);
            return () => {
                this.srA.set(address);
                return null;
            };
        }),
        // RST 0/1/2/3/4/5/6/7
        ...this.generateOperation(
            {
                0xc7: 0x00,
                0xcf: 0x08,
                0xd7: 0x10,
                0xdf: 0x18,
                0xe7: 0x20,
                0xef: 0x28,
                0xf7: 0x30,
                0xff: 0x38,
            },
            (jumpAdr) => this.call(jumpAdr, () => () => null)
        ),
        // CALL a16
        0xcd: this.nextWord((value) => this.call(value, () => () => null)),
        // CALL NZ/Z/NC/C a16
        ...this.generateOperation(
            {
                0xc4: () => !this.flag(FLAG_ZERO),
                0xcc: () => this.flag(FLAG_ZERO),
                0xd4: () => !this.flag(FLAG_CARRY),
                0xdc: () => this.flag(FLAG_CARRY),
            },
            (condition) =>
                this.nextWord((value) =>
                    condition() ? this.call(value, () => () => null) : () => null
                )
        ),
        // RET
        0xc9: this.return(() => () => null),
        // RETI
        0xd9: this.return((s, i) => {
            i.enableInterrupts();
            return () => null;
        }),
        // RET Z/C/NZ/NC
        ...this.generateOperation(
            {
                0xc0: () => !this.flag(FLAG_ZERO),
                0xc8: () => this.flag(FLAG_ZERO),
                0xd0: () => !this.flag(FLAG_CARRY),
                0xd8: () => this.flag(FLAG_CARRY),
            },
            (condition) => () => condition() ? this.return(() => () => null) : () => null
        ),
        // JP a16
        0xc3: this.nextWord((value) => this.jump(value, () => () => null)),
        // JP HL
        0xe9: this.jump(
            () => this.regHL.get(),
            () => null
        ),
        // JP Z/C/NZ/NC, a16
        ...this.generateOperation(
            {
                0xc2: () => !this.flag(FLAG_ZERO),
                0xca: () => this.flag(FLAG_ZERO),
                0xd2: () => !this.flag(FLAG_CARRY),
                0xda: () => this.flag(FLAG_CARRY),
            },
            (condition) =>
                this.nextWord(
                    (value) => () => condition() ? this.jump(value, () => null) : null
                )
        ),
        // JR s8
        0x18: this.nextByte((value) => this.jumpr(asSignedInt8(value), () => () => null)),
        // JR NZ/Z/NC/C, s8
        ...this.generateOperation(
            {
                0x20: () => !this.flag(FLAG_ZERO),
                0x28: () => this.flag(FLAG_ZERO),
                0x30: () => !this.flag(FLAG_CARRY),
                0x38: () => this.flag(FLAG_CARRY),
            },
            (condition) =>
                this.nextByte(
                    (value) => () =>
                        condition() ? this.jumpr(asSignedInt8(value), () => null) : null
                )
        ),
        // POP BC/DE/HL/AF
        ...this.generateOperation(
            {
                0xc1: this.regBC,
                0xd1: this.regDE,
                0xe1: this.regHL,
            },
            (r) =>
                this.pop((value) => () => {
                    r.set(value);
                    return null;
                })
        ),
        // We need to mask lower 4 bits bc hardwired to 0
        0xf1: this.pop((value) => () => {
            this.regAF.set(value & 0xfff0);
            return null;
        }),
        // PUSH BC/DE/HL/AF
        ...this.generateOperation(
            {
                0xc5: this.regBC,
                0xd5: this.regDE,
                0xe5: this.regHL,
                0xf5: this.regAF,
            },
            (register) =>
                this.push(
                    () => register.get(),
                    () => () => null
                )
        ),
        // RLCA / RLA / RRCA / RRA
        0x07: () => {
            const result = this.rotateL(this.srA.get(), false, false);
            this.srA.set(result);
            return null;
        },
        0x17: () => {
            const result = this.rotateL(this.srA.get(), true, false);
            this.srA.set(result);
            return null;
        },
        0x0f: () => {
            const result = this.rotateR(this.srA.get(), false, false);
            this.srA.set(result);
            return null;
        },
        0x1f: () => {
            const result = this.rotateR(this.srA.get(), true, false);
            this.srA.set(result);
            return null;
        },
        // ADD SP, s8
        0xe8: this.nextByte((value) => () => {
            const s8 = asSignedInt8(value);
            const sp = this.regSP.get();
            this.regSP.set(this.perfAdd(s8, sp));
            return () => () => null; // 3 cycles (idk the timing yet)
        }),
        // LD HL, SP+s8
        0xf8: this.nextByte((value) => () => {
            const s8 = asSignedInt8(value);
            const sp = this.regSP.get();
            this.regHL.set(this.perfAdd(s8, sp));
            return () => null;
        }),
        // LD SP, HL
        0xf9: () => {
            this.regSP.set(this.regHL.get());
            return () => null;
        },
        // DI / EI
        0xf3: (s, i) => {
            i.disableInterrupts();
            return null;
        },
        0xfb: (s, i) => {
            i.enableInterrupts();
            return null;
        },
        // HALT
        0x76: (s, interrupts) => {
            this.halted = true;
            if (!interrupts.fastEnableInterrupts() && interrupts.hasPendingInterrupt) {
                this.haltBug = true; // halt bug triggered on HALT when IME == 0 & IE&IF != 0
            }
            return null;
        },
        // SCF / CCF
        0x37: () => {
            this.setFlag(FLAG_SUBSTRACTION, false);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_CARRY, true);
            return null;
        },
        0x3f: () => {
            this.setFlag(FLAG_SUBSTRACTION, false);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_CARRY, !this.flag(FLAG_CARRY));
            return null;
        },
        // DAA
        0x27: () => {
            let a = this.srA.get();
            let adjust = this.flag(FLAG_CARRY) ? 0x60 : 0x00;
            if (this.flag(FLAG_HALFCARRY)) {
                adjust |= 0x06;
            }
            if (!this.flag(FLAG_SUBSTRACTION)) {
                if ((a & 0x0f) > 0x09) adjust |= 0x06;
                if (a > 0x99) adjust |= 0x60;
            }

            a = wrap8(a + (this.flag(FLAG_SUBSTRACTION) ? -adjust : adjust));
            this.srA.set(a);
            this.setFlag(FLAG_CARRY, adjust >= 0x60);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_ZERO, a === 0);
            return null;
        },
        // CPL
        0x2f: () => {
            this.srA.set(~this.srA.get() & 0xff);
            this.setFlag(FLAG_SUBSTRACTION, true);
            this.setFlag(FLAG_HALFCARRY, true);
            return null;
        },
    };

    /**
     * A list of all 16-bit opcodes. Works the same as instructionSet.
     */
    protected extendedInstructionSet: Partial<Record<number, InstructionMethod>> = {
        // RLC ...
        ...this.generateExtendedOperation(0x00, ({ get, set }) =>
            get((value) => set(this.rotateL(value, false, true), () => null))
        ),
        // RRC ...
        ...this.generateExtendedOperation(0x08, ({ get, set }) =>
            get((value) => set(this.rotateR(value, false, true), () => null))
        ),
        // RL ...
        ...this.generateExtendedOperation(0x10, ({ get, set }) =>
            get((value) => set(this.rotateL(value, true, true), () => null))
        ),
        // RC ...
        ...this.generateExtendedOperation(0x18, ({ get, set }) =>
            get((value) => set(this.rotateR(value, true, true), () => null))
        ),
        // SLA ...
        ...this.generateExtendedOperation(0x20, ({ get, set }) =>
            get((value) => {
                const result = (value << 1) & 0xff;
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, ((value >> 7) & 0b1) === 1);
                return set(result, () => null);
            })
        ),
        // SRA ...
        ...this.generateExtendedOperation(0x28, ({ get, set }) =>
            get((value) => {
                const result = ((value >> 1) & 0xff) | (value & (1 << 7)); // bit 7 left unchanged
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, (value & 0b1) === 1);
                return set(result, () => null);
            })
        ),
        // SRL ...
        ...this.generateExtendedOperation(0x38, ({ get, set }) =>
            get((value) => {
                const result = (value >> 1) & 0xff;
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, (value & 0b1) === 1);
                return set(result, () => null);
            })
        ),
        // SWAP ...
        ...this.generateExtendedOperation(0x30, ({ get, set }) =>
            get((value) => {
                const result = ((value & 0x0f) << 4) | ((value & 0xf0) >> 4);
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, false);
                return set(result, () => null);
            })
        ),
        // BIT 0/1/2/.../7, ...
        ...[...new Array(8)].reduce(
            (previous, _, bit) => ({
                ...previous,
                ...this.generateExtendedOperation(0x40 + bit * 8, ({ get }) =>
                    get((value) => {
                        const out = (value >> bit) & 0b1;
                        this.setFlag(FLAG_ZERO, out === 0);
                        this.setFlag(FLAG_SUBSTRACTION, false);
                        this.setFlag(FLAG_HALFCARRY, true);
                        return null;
                    })
                ),
            }),
            {} as Partial<Record<number, InstructionMethod>>
        ),
        // RES 0/1/2/.../7, ...
        ...[...new Array(8)].reduce(
            (previous, _, bit) => ({
                ...previous,
                ...this.generateExtendedOperation(0x80 + bit * 8, ({ get, set }) =>
                    get((value) => {
                        const result = value & ~(1 << bit);
                        return set(result, () => null);
                    })
                ),
            }),
            {} as Partial<Record<number, InstructionMethod>>
        ),
        // SET 0/1/2/.../7, ...
        ...[...new Array(8)].reduce(
            (previous, _, bit) => ({
                ...previous,
                ...this.generateExtendedOperation(0xc0 + bit * 8, ({ get, set }) =>
                    get((value) => {
                        const result = value | (1 << bit);
                        return set(result, () => null);
                    })
                ),
            }),
            {} as Partial<Record<number, InstructionMethod>>
        ),
    };

    // Helper functions for instructions
    /** Reads flags */
    protected flag(flag: number): boolean {
        return this.regAF.l.flag(flag);
    }
    /** Sets flags */
    protected setFlag(flag: number, state: boolean) {
        this.regAF.l.sflag(flag, state);
    }
    /** Increments an 8bit value (wrapping), updates flags Z/0/H */
    protected incN(n: number): number {
        const result = wrap8(n + 1);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) < (n & 0xf));
        return result;
    }

    /** Decrements an 8bit value (wrapping), updates flags Z/1/H */
    protected decN(n: number): number {
        const result = wrap8(n - 1);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) > (n & 0xf));
        return result;
    }

    /** Adds a value to register A, updates flags Z/0/H/CY */
    protected addNToA(n: number, carry: boolean) {
        const a = this.srA.get();
        const carryVal = carry && this.flag(FLAG_CARRY) ? 1 : 0;
        const result = wrap8(a + n + carryVal);
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) + (n & 0xf) + carryVal > 0xf);
        this.setFlag(FLAG_CARRY, a + n + carryVal > 0xff);
    }
    /** Adds the two given 16-bit values (updating flags), returns the result */
    protected perfAdd(a: number, b: number) {
        const result = wrap16(a + b);
        this.setFlag(FLAG_ZERO, false);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_CARRY, (a & 0xff) > 0xff - (b & 0xff));
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) > 0xf - (b & 0xf));
        return result;
    }
    /** Substracts a value from register A, updates flags Z/1/H/CY */
    protected subNFromA(n: number, carry: boolean) {
        const a = this.srA.get();
        const carryVal = carry && this.flag(FLAG_CARRY) ? 1 : 0;
        const result = wrap8(a - n - carryVal);
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) - (n & 0xf) - carryVal < 0);
        this.setFlag(FLAG_CARRY, a - n - carryVal < 0);
    }
    /** Stores the given boolean operation of A and the given value in A, updates Z/0/H/0 */
    protected boolNToA(n: number, op: "&" | "|" | "^") {
        const a = this.srA.get();
        const result = op === "&" ? a & n : op === "|" ? a | n : a ^ n;
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, op === "&");
        this.setFlag(FLAG_CARRY, false);
    }
    /** Compares the given number with the value in A without changing A, updates Z/1/H/CY */
    protected compNToA(n: number) {
        const a = this.srA.get();
        this.subNFromA(n, false);
        this.srA.set(a);
    }
    /**
     * Pushes the given data to the stack pointer's position, and moves it back by two
     * Takes 3 cycles
     */
    protected push(
        data: number | (() => number),
        receiver: () => InstructionReturn
    ): InstructionMethod {
        return () => (system) => {
            const effectiveData = typeof data === "number" ? data : data();
            this.regSP.dec();
            system.write(this.regSP.get(), high(effectiveData));
            return (system) => {
                this.regSP.dec();
                system.write(this.regSP.get(), low(effectiveData));
                return receiver();
            };
        };
    }
    /**
     * Pops a 16bit address from the stack pointer's position, and moves it forward by two.
     * Takes two cycles.
     */
    protected pop(receiver: (value: number) => InstructionMethod): InstructionMethod {
        return (s) => {
            const low = s.read(this.regSP.inc());
            return (s) => {
                const high = s.read(this.regSP.inc());
                return receiver(combine(high, low));
            };
        };
    }
    /**
     * Pushes the current PC to memory, and jump to the given address.
     * Takes 3 cycles.
     */
    protected call(address: number, receiver: () => InstructionReturn): InstructionMethod {
        return this.push(
            () => this.regPC.get(),
            () => {
                this.regPC.set(address);
                return receiver();
            }
        );
    }

    /**
     * Returns the current call (ie. consumes a pointer at SP and sets it to PC).
     * Takes 3 cycles.
     */
    protected return(receiver: InstructionMethod): InstructionMethod {
        return this.pop((value) => (s, i) => {
            this.regPC.set(value);
            return receiver(s, i);
        });
    }
    /**
     * Jumps to the given 16bit address
     * Takes one cycle
     */
    protected jump(
        n: number | (() => number),
        receiver: () => InstructionReturn
    ): InstructionMethod {
        return () => {
            const address = typeof n === "number" ? n : n();
            this.regPC.set(address);
            return receiver();
        };
    }
    /**
     * Relative-jumps by the given 8-bit value
     * Takes one cycle
     */
    protected jumpr(
        n: number | (() => number),
        receiver: () => InstructionReturn
    ): InstructionMethod {
        return () => {
            const address = typeof n === "number" ? n : n();
            this.regPC.set(wrap16(this.regPC.get() + address));
            return receiver();
        };
    }
    /** Rotates the given number left. Sets flags Z|0/0/0/N7 */
    protected rotateL(n: number, useCarry: boolean, setZero: boolean) {
        const bit7 = (n >> 7) & 0b1;
        const cflag = this.flag(FLAG_CARRY) ? 1 : 0;
        const result = ((n << 1) & 0xff) | (useCarry ? cflag : bit7);
        this.setFlag(FLAG_ZERO, setZero && result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, false);
        this.setFlag(FLAG_CARRY, bit7 === 1);
        return result;
    }
    /** Rotates the given number right. Sets flags Z|0/0/0/N0 */
    protected rotateR(n: number, useCarry: boolean, setZero: boolean) {
        const bit0 = n & 0b1;
        const cflag = this.flag(FLAG_CARRY) ? 1 : 0;
        const result = ((n >> 1) & 0xff) | ((useCarry ? cflag : bit0) << 7);
        this.setFlag(FLAG_ZERO, setZero && result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, false);
        this.setFlag(FLAG_CARRY, bit0 === 1);
        return result;
    }

    /**
     * Helper function for instructions that do the same operations for a set of objects.
     * @param items The object the operation runs on, matched to its opcode.
     * @param execute A function that executes the instruction for a given object.
     * @returns An object with the completed instructions
     */
    protected generateOperation<K extends number, T>(
        items: Record<K, T>,
        execute: (r: T) => InstructionMethod
    ): Record<K, InstructionMethod> {
        const obj: Record<K, InstructionMethod> = {} as any;
        for (const [opcode, item] of Object.entries(items) as any as [K, T][]) {
            obj[opcode] = execute(item);
        }
        return obj;
    }

    /**
     * Helper function for instructions that follow the same B-C-D-E-H-L-(HL)-A pattern
     * @param baseCode The base code of the instruction (e.g. 0x50)
     * @param execute A function that executes the instruction for a given register
     * @returns An object with the completed instructions (e.g. 0x50, 0x51, ..., 0x57)
     */
    protected generateExtendedOperation(
        baseCode: number,
        execute: InstrMeth<AsyncRegister>
    ): Partial<Record<number, InstructionMethod>> {
        const make: (sr: Register) => AsyncRegister = (sr) => ({
            get: (r) => {
                const value = sr.get();
                return r(value);
            },
            set: (x, r) => {
                sr.set(x);
                return r();
            },
        });
        const regB = make(this.srB);
        const regC = make(this.srC);
        const regD = make(this.srD);
        const regE = make(this.srE);
        const regH = make(this.srH);
        const regL = make(this.srL);
        const regA = make(this.srA);

        // order matters: B/C/D/E/H/L/(HL)/A
        return {
            [baseCode + 0]: (s) => execute(regB),
            [baseCode + 1]: (s) => execute(regC),
            [baseCode + 2]: (s) => execute(regD),
            [baseCode + 3]: (s) => execute(regE),
            [baseCode + 4]: (s) => execute(regH),
            [baseCode + 5]: (s) => execute(regL),
            [baseCode + 6]: (s) =>
                execute({
                    get: (r) => {
                        const value = s.read(this.regHL.get());
                        return () => r(value);
                    },
                    set: (x, r) => {
                        s.write(this.regHL.get(), x);
                        return () => r();
                    },
                } satisfies AsyncRegister),
            [baseCode + 7]: (s) => execute(regA),
        };
    }
}

type InstrMeth<A = void, B = void, C = void> = (a: A, b: B, c: C) => InstructionReturn;

type AsyncRegister = {
    get: InstrMeth<InstrMeth<number>>;
    set: InstrMeth<number, InstrMeth>;
};

export default CPU;
