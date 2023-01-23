import Interrupts from "./Interrupts";
import { Register, SubRegister } from "./Register";
import System from "./System";
import { combine, high, Int8Map, low, Tuple } from "./util";

const FLAG_ZERO: u8 = 1 << 7;
const FLAG_SUBSTRACTION: u8 = 1 << 6;
const FLAG_HALFCARRY: u8 = 1 << 5;
const FLAG_CARRY: u8 = 1 << 4;

type InstructionMethod = (system: System) => InstructionReturn;
type InstructionReturn = InstructionMethod | null;

/**
 * The CPU of the GBC, responsible for reading the code and executing instructions.
 */
class CPU {
    // All registers are 16 bits long.
    // AF: lower is flags: ZNHC (zero, substraction, half-carry, carry)
    protected regAF: Register = new Register();
    protected regBC: Register = new Register();
    protected regDE: Register = new Register();
    protected regHL: Register = new Register();
    protected regPC: Register = new Register(); // program counter
    protected regSP: Register = new Register(); // stack pointer

    // If the CPU is halted
    protected halted: boolean = false;
    // If the CPU was halted when IME=0
    protected haltBug: boolean = false;

    // Subregisters, for convenience sake
    protected srA: SubRegister = this.regAF.h;
    protected srB: SubRegister = this.regBC.h;
    protected srC: SubRegister = this.regBC.l;
    protected srD: SubRegister = this.regDE.h;
    protected srE: SubRegister = this.regDE.l;
    protected srH: SubRegister = this.regHL.h;
    protected srL: SubRegister = this.regHL.l;

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

    constructor() {
        this.generateOperationTable();
    }

    // Returns the next opcode
    protected nextOpCode(system: System): number {
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
        address: () => number,
        receiver: (value: number) => InstructionMethod
    ): InstructionMethod {
        return (system: System) => {
            const effectiveAddress = address();
            const value = system.read(effectiveAddress);
            return receiver(value);
        };
    }

    /**
     * Reads the next byte from the PC and increases it.
     * Takes 1 cycle.
     */
    protected nextByte(receiver: (value: number) => InstructionMethod): InstructionMethod {
        return (system: System) => {
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

    getStepCounts(): number {
        return this.stepCounter;
    }

    getPC(): u16 {
        return this.regPC.get();
    }

    /**
     * Steps through one line of the code, and returns the M-cycles required for the
     * operation
     * @param system The system to execute the instruction on
     * @param verbose If true, prints the executed instruction to the console
     * @returns true if the CPU is in a "set" state (ie. it's halted or just finished an
     * instruction), false if it is mid-instruction.
     */
    step(system: System, verbose: boolean = false): boolean {
        if (this.nextStep === null) {
            const interrupts = system.getInterrupts();
            const nextStep = this.loadNextOp(system, interrupts, verbose);
            if (nextStep === null) return true;
            this.nextStep = nextStep;
        }

        this.nextStep = this.nextStep(system);
        if (this.nextStep === null) {
            this.currentOpcode = system.read(this.regPC.inc());
        }
        return this.nextStep === null;
    }

    protected loadNextOp(
        system: System,
        interrupts: Interrupts,
        verbose: boolean = false
    ): InstructionMethod | null {
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
                    console.log(`[CPU] interrupt execute, goto ${execNext.toString(16)}`);
                return nextStep;
            }
        }

        // Do nothing if halted
        if (this.halted) {
            return null;
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

        const instruction = this.instructionSet.get(opcode);
        if (instruction === undefined) {
            throw new Error(
                `Unrecognized opcode ${opcode.toString(16)} at address ${(
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
    protected instructionSet: Int8Map<InstructionMethod> = new Map<u8, InstructionMethod>();

    protected generateOperationTable(): void {
        const generateOperation = this.generateOperation;
        const P = this.P;

        // NOP
        this.instructionSet.set(0x00, () => null);

        // Extended instructions
        this.instructionSet.set(
            0xcb,
            this.nextByte((opcode) => (system) => {
                const instruction = this.extendedInstructionSet.get(opcode);
                if (instruction === undefined) {
                    throw new Error(
                        `Unrecognized extended opcode ${opcode.toString(16)} at address ${(
                            this.regPC.get() - 1
                        ).toString(16)}`
                    );
                }
                return instruction(system);
            })
        );

        // LD BC/DE/HL/SP, d16
        generateOperation(
            [
                P(0x01, this.regBC),
                P(0x11, this.regDE),
                P(0x21, this.regHL),
                P(0x31, this.regSP),
            ],
            (register) =>
                this.nextWord((value) => () => {
                    register.set(value);
                    return null;
                })
        );

        // INC BC/DE/HL/SP
        generateOperation(
            [
                P(0x03, this.regBC),
                P(0x13, this.regDE),
                P(0x23, this.regHL),
                P(0x33, this.regSP),
            ],
            (register) => () => () => {
                register.inc();
                return null;
            }
        );

        // DEC BC/DE/HL/SP
        generateOperation(
            [
                P(0x0b, this.regBC),
                P(0x1b, this.regDE),
                P(0x2b, this.regHL),
                P(0x3b, this.regSP),
            ],
            (register) => () => () => {
                register.dec();
                return null;
            }
        );

        // ADD HL, BC/DE/HL/SP
        generateOperation(
            [
                P(0x09, this.regBC),
                P(0x19, this.regDE),
                P(0x29, this.regHL),
                P(0x39, this.regSP),
            ],
            (register) => () => () => {
                this.addRToHL(register);
                return null;
            }
        );

        // INC B/D/H/C/E/L/A
        generateOperation(
            [
                P(0x04, this.srB),
                P(0x0c, this.srC),
                P(0x14, this.srD),
                P(0x1c, this.srE),
                P(0x24, this.srH),
                P(0x2c, this.srL),
                P(0x3c, this.srA),
            ],
            (register) => () => {
                this.incSr(register);
                return null;
            }
        );

        // INC (HL)
        this.instructionSet.set(
            0x34,
            this.readAddress(
                () => this.regHL.get(),
                (value) => (s) => {
                    const result = this.incN(value);
                    s.write(this.regHL.get(), result);
                    return () => null;
                }
            )
        );

        // DEC B/D/H/C/E/L/A
        generateOperation(
            [
                P(0x05, this.srB),
                P(0x0d, this.srC),
                P(0x15, this.srD),
                P(0x1d, this.srE),
                P(0x25, this.srH),
                P(0x2d, this.srL),
                P(0x3d, this.srA),
            ],
            (register) => () => {
                this.decSr(register);
                return null;
            }
        );

        // DEC (HL)
        this.instructionSet.set(
            0x35,
            this.readAddress(
                () => this.regHL.get(),
                (value) => (s) => {
                    const result = this.decN(value);
                    s.write(this.regHL.get(), result);
                    return () => null;
                }
            )
        );

        // LD (BC/DE/HL+/HL-), A
        generateOperation(
            [
                P(0x02, () => this.regBC.get()),
                P(0x12, () => this.regDE.get()),
                P(0x22, () => this.regHL.inc()),
                P(0x32, () => this.regHL.dec()),
            ],
            (getAddress) => (s) => {
                const address = getAddress();
                s.write(address, this.srA.get());
                return () => null;
            }
        );

        // LD A, (BC/DE/HL+/HL-)
        generateOperation(
            [
                P(0x0a, () => this.regBC.get()),
                P(0x1a, () => this.regDE.get()),
                P(0x2a, () => this.regHL.inc()),
                P(0x3a, () => this.regHL.dec()),
            ],
            (getAddress) =>
                this.readAddress(getAddress, (value) => () => {
                    this.srA.set(value);
                    return null;
                })
        );

        // LD B/C/D/E/H/L/A, d8
        generateOperation(
            [
                P(0x06, this.srB),
                P(0x0e, this.srC),
                P(0x16, this.srD),
                P(0x1e, this.srE),
                P(0x26, this.srH),
                P(0x2e, this.srL),
                P(0x3e, this.srA),
            ],
            (register) =>
                this.nextByte((value) => () => {
                    register.set(value);
                    return null;
                })
        );

        // LD (HL), d8
        this.instructionSet.set(
            0x36,
            this.nextByte((value) => (s) => {
                s.write(this.regHL.get(), value);
                return () => null;
            })
        );

        // LD (a16), SP
        this.instructionSet.set(
            0x08,
            this.nextWord((value) => (s) => {
                s.write(value, this.regSP.l.get());
                return () => {
                    s.write(value + 1, this.regSP.h.get());
                    return () => null;
                };
            })
        );

        // LD B/C/D/E/H/L/A, B/C/D/E/H/L/A
        generateOperation(
            [
                P(0x40, P(this.srB, this.srB)),
                P(0x41, P(this.srB, this.srC)),
                P(0x42, P(this.srB, this.srD)),
                P(0x43, P(this.srB, this.srE)),
                P(0x44, P(this.srB, this.srH)),
                P(0x45, P(this.srB, this.srL)),
                P(0x47, P(this.srB, this.srA)),

                P(0x48, P(this.srC, this.srB)),
                P(0x49, P(this.srC, this.srC)),
                P(0x4a, P(this.srC, this.srD)),
                P(0x4b, P(this.srC, this.srE)),
                P(0x4c, P(this.srC, this.srH)),
                P(0x4d, P(this.srC, this.srL)),
                P(0x4f, P(this.srC, this.srA)),

                P(0x50, P(this.srD, this.srB)),
                P(0x51, P(this.srD, this.srC)),
                P(0x52, P(this.srD, this.srD)),
                P(0x53, P(this.srD, this.srE)),
                P(0x54, P(this.srD, this.srH)),
                P(0x55, P(this.srD, this.srL)),
                P(0x57, P(this.srD, this.srA)),

                P(0x58, P(this.srE, this.srB)),
                P(0x59, P(this.srE, this.srC)),
                P(0x5a, P(this.srE, this.srD)),
                P(0x5b, P(this.srE, this.srE)),
                P(0x5c, P(this.srE, this.srH)),
                P(0x5d, P(this.srE, this.srL)),
                P(0x5f, P(this.srE, this.srA)),

                P(0x60, P(this.srH, this.srB)),
                P(0x61, P(this.srH, this.srC)),
                P(0x62, P(this.srH, this.srD)),
                P(0x63, P(this.srH, this.srE)),
                P(0x64, P(this.srH, this.srH)),
                P(0x65, P(this.srH, this.srL)),
                P(0x67, P(this.srH, this.srA)),

                P(0x68, P(this.srL, this.srB)),
                P(0x69, P(this.srL, this.srC)),
                P(0x6a, P(this.srL, this.srD)),
                P(0x6b, P(this.srL, this.srE)),
                P(0x6c, P(this.srL, this.srH)),
                P(0x6d, P(this.srL, this.srL)),
                P(0x6f, P(this.srL, this.srA)),

                P(0x78, P(this.srA, this.srB)),
                P(0x79, P(this.srA, this.srC)),
                P(0x7a, P(this.srA, this.srD)),
                P(0x7b, P(this.srA, this.srE)),
                P(0x7c, P(this.srA, this.srH)),
                P(0x7d, P(this.srA, this.srL)),
                P(0x7f, P(this.srA, this.srA)),
            ],
            (targets) => () => {
                targets.a.set(targets.b.get());
                return null;
            }
        );

        // LD B/C/D/E/H/L/A, (HL)
        generateOperation(
            [
                P(0x46, this.srB),
                P(0x4e, this.srC),
                P(0x56, this.srD),
                P(0x5e, this.srE),
                P(0x66, this.srH),
                P(0x6e, this.srL),
                P(0x7e, this.srA),
            ],
            (register) =>
                this.readAddress(
                    () => this.regHL.get(),
                    (value) => () => {
                        register.set(value);
                        return () => null;
                    }
                )
        );

        // LD (HL), B/C/D/E/H/L/A
        generateOperation(
            [
                P(0x70, this.srB),
                P(0x71, this.srC),
                P(0x72, this.srD),
                P(0x73, this.srE),
                P(0x74, this.srH),
                P(0x75, this.srL),
                P(0x77, this.srA),
            ],
            (register) => (system) => {
                const address = this.regHL.get();
                system.write(address, register.get());
                return () => null;
            }
        );

        // ADD A, B/C/D/E/H/L/A/(HL)/d8
        generateOperation(
            [
                P(0x80, this.srB),
                P(0x81, this.srC),
                P(0x82, this.srD),
                P(0x83, this.srE),
                P(0x84, this.srH),
                P(0x85, this.srL),
                P(0x87, this.srA),
            ],
            (register) => () => {
                this.addNToA(register.get(), false);
                return null;
            }
        );
        this.instructionSet.set(
            0x86,
            this.readAddress(
                () => this.regHL.get(),
                (value) => () => {
                    this.addNToA(value, false);
                    return null;
                }
            )
        );
        this.instructionSet.set(
            0xc6,
            this.nextByte((value) => () => {
                this.addNToA(value, false);
                return null;
            })
        );

        // ADDC A, B/C/D/E/H/L/A/(HL)/d8
        generateOperation(
            [
                P(0x88, this.srB),
                P(0x89, this.srC),
                P(0x8a, this.srD),
                P(0x8b, this.srE),
                P(0x8c, this.srH),
                P(0x8d, this.srL),
                P(0x8f, this.srA),
            ],
            (register) => () => {
                this.addNToA(register.get(), true);
                return null;
            }
        );
        this.instructionSet.set(
            0x8e,
            this.readAddress(
                () => this.regHL.get(),
                (value) => () => {
                    this.addNToA(value, true);
                    return null;
                }
            )
        );
        this.instructionSet.set(
            0xce,
            this.nextByte((value) => () => {
                this.addNToA(value, true);
                return null;
            })
        );

        // SUB A, B/C/D/E/H/L/A/(HL)/d8
        generateOperation(
            [
                P(0x90, this.srB),
                P(0x91, this.srC),
                P(0x92, this.srD),
                P(0x93, this.srE),
                P(0x94, this.srH),
                P(0x95, this.srL),
                P(0x97, this.srA),
            ],
            (register) => () => {
                this.subNFromA(register.get(), false);
                return null;
            }
        );
        this.instructionSet.set(
            0x96,
            this.readAddress(
                () => this.regHL.get(),
                (value) => () => {
                    this.subNFromA(value, false);
                    return null;
                }
            )
        );
        this.instructionSet.set(
            0xd6,
            this.nextByte((value) => () => {
                this.subNFromA(value, false);
                return null;
            })
        );

        // SBC A, B/C/D/E/H/L/A/(HL)/d8
        generateOperation(
            [
                P(0x98, this.srB),
                P(0x99, this.srC),
                P(0x9a, this.srD),
                P(0x9b, this.srE),
                P(0x9c, this.srH),
                P(0x9d, this.srL),
                P(0x9f, this.srA),
            ],
            (register) => () => {
                this.subNFromA(register.get(), true);
                return null;
            }
        );
        this.instructionSet.set(
            0x9e,
            this.readAddress(
                () => this.regHL.get(),
                (value) => () => {
                    this.subNFromA(value, true);
                    return null;
                }
            )
        );
        this.instructionSet.set(
            0xde,
            this.nextByte((value) => () => {
                this.subNFromA(value, true);
                return null;
            })
        );

        // AND/XOR/OR B/C/D/E/H/L/A
        generateOperation<Tuple<SubRegister, "&" | "|" | "^">>(
            [
                P(0xa0, P(this.srB, "&")),
                P(0xa1, P(this.srC, "&")),
                P(0xa2, P(this.srD, "&")),
                P(0xa3, P(this.srE, "&")),
                P(0xa4, P(this.srH, "&")),
                P(0xa5, P(this.srL, "&")),
                P(0xa7, P(this.srA, "&")),

                P(0xa8, P(this.srB, "^")),
                P(0xa9, P(this.srC, "^")),
                P(0xaa, P(this.srD, "^")),
                P(0xab, P(this.srE, "^")),
                P(0xac, P(this.srH, "^")),
                P(0xad, P(this.srL, "^")),
                P(0xaf, P(this.srA, "^")),

                P(0xb0, P(this.srB, "|")),
                P(0xb1, P(this.srC, "|")),
                P(0xb2, P(this.srD, "|")),
                P(0xb3, P(this.srE, "|")),
                P(0xb4, P(this.srH, "|")),
                P(0xb5, P(this.srL, "|")),
                P(0xb7, P(this.srA, "|")),
            ],
            (regAndOp) => () => {
                this.boolNToA(regAndOp.a.get(), regAndOp.b);
                return null;
            }
        );

        // AND/XOR/OR (HL)
        generateOperation(
            [P(0xa6, "&" as const), P(0xae, "^" as const), P(0xb6, "|" as const)],
            (op) =>
                this.readAddress(
                    () => this.regHL.get(),
                    (value) => () => {
                        this.boolNToA(value, op);
                        return null;
                    }
                )
        );

        // AND/XOR/OR d8
        generateOperation(
            [P(0xe6, "&" as const), P(0xee, "^" as const), P(0xf6, "|" as const)],
            (op) =>
                this.nextByte((value) => () => {
                    this.boolNToA(value, op);
                    return null;
                })
        );

        // CP B/C/D/E/H/L/A/(HL)/d8
        generateOperation(
            [
                P(0xb8, this.srB),
                P(0xb9, this.srC),
                P(0xba, this.srD),
                P(0xbb, this.srE),
                P(0xbc, this.srH),
                P(0xbd, this.srL),
                P(0xbf, this.srA),
            ],
            (r) => () => {
                this.compNToA(r.get());
                return null;
            }
        );
        this.instructionSet.set(
            0xbe,
            this.readAddress(
                () => this.regHL.get(),
                (value) => () => {
                    this.compNToA(value);
                    return null;
                }
            )
        );
        this.instructionSet.set(
            0xfe,
            this.nextByte((value) => () => {
                this.compNToA(value);
                return null;
            })
        );

        // LD (a8), A
        this.instructionSet.set(
            0xe0,
            this.nextByte((address) => (system) => {
                const value = this.srA.get();
                system.write(0xff00 | (<u16>address), value);
                return () => null;
            })
        );

        // LD A, (a8)
        this.instructionSet.set(
            0xf0,
            this.nextByte((address) =>
                this.readAddress(
                    () => 0xff00 | (<u16>address),
                    (data) => () => {
                        this.srA.set(data);
                        return null;
                    }
                )
            )
        );

        // LD (C), A
        this.instructionSet.set(0xe2, (system) => {
            const value = this.srA.get();
            system.write(0xff00 | (<u16>this.srC.get()), value);
            return () => null;
        });

        // LD A, (C)
        this.instructionSet.set(
            0xf2,
            this.readAddress(
                () => 0xff00 | (<u16>this.srC.get()),
                (data) => () => {
                    this.srA.set(data);
                    return null;
                }
            )
        );

        // LD (a16), A
        this.instructionSet.set(
            0xea,
            this.nextWord((address) => (system) => {
                const value = this.srA.get();
                system.write(address, value);
                return () => null;
            })
        );

        // LD A, (a16)
        this.instructionSet.set(
            0xfa,
            this.nextWord((address) => (system) => {
                //TODO: use readAddress ?
                const value = system.read(address);
                this.srA.set(value);
                return () => null;
            })
        );

        // RST 0/1/2/3/4/5/6/7
        generateOperation(
            [
                P(0xc7, 0x00),
                P(0xcf, 0x08),
                P(0xd7, 0x10),
                P(0xdf, 0x18),
                P(0xe7, 0x20),
                P(0xef, 0x28),
                P(0xf7, 0x30),
                P(0xff, 0x38),
            ],
            (jumpAdr) => this.call(jumpAdr, () => () => null)
        );

        // CALL a16
        this.instructionSet.set(
            0xcd,
            this.nextWord((value) => this.call(value, () => () => null))
        );

        // CALL NZ/Z/NC/C a16
        generateOperation(
            [
                P(0xc4, () => !this.flag(FLAG_ZERO)),
                P(0xcc, () => this.flag(FLAG_ZERO)),
                P(0xd4, () => !this.flag(FLAG_CARRY)),
                P(0xdc, () => this.flag(FLAG_CARRY)),
            ],
            (condition) =>
                this.nextWord((value) =>
                    condition() ? this.call(value, () => () => null) : () => null
                )
        );

        // RET
        this.instructionSet.set(
            0xc9,
            this.return(() => () => null)
        );

        // RETI
        this.instructionSet.set(
            0xd9,
            this.return((s) => {
                s.getInterrupts().enableInterrupts();
                return () => null;
            })
        );

        // RET Z/C/NZ/NC
        generateOperation(
            [
                P(0xc0, () => !this.flag(FLAG_ZERO)),
                P(0xc8, () => this.flag(FLAG_ZERO)),
                P(0xd0, () => !this.flag(FLAG_CARRY)),
                P(0xd8, () => this.flag(FLAG_CARRY)),
            ],
            (condition) => () => condition() ? this.return(() => () => null) : () => null
        );

        // JP a16
        this.instructionSet.set(
            0xc3,
            this.nextWord((value) =>
                this.jump(
                    () => value,
                    () => () => null
                )
            )
        );

        // JP HL
        this.instructionSet.set(
            0xe9,
            this.jump(
                () => this.regHL.get(),
                () => null
            )
        );

        // JP Z/C/NZ/NC, a16
        generateOperation(
            [
                P(0xc2, () => !this.flag(FLAG_ZERO)),
                P(0xca, () => this.flag(FLAG_ZERO)),
                P(0xd2, () => !this.flag(FLAG_CARRY)),
                P(0xda, () => this.flag(FLAG_CARRY)),
            ],
            (condition) =>
                this.nextWord(
                    (value) => () =>
                        condition()
                            ? this.jump(
                                  () => value,
                                  () => null
                              )
                            : null
                )
        );

        // JR s8
        this.instructionSet.set(
            0x18,
            this.nextByte((value) =>
                this.jumpr(
                    () => <i8>value,
                    () => () => null
                )
            )
        );

        // JR NZ/Z/NC/C, s8
        generateOperation(
            [
                P(0x20, () => !this.flag(FLAG_ZERO)),
                P(0x28, () => this.flag(FLAG_ZERO)),
                P(0x30, () => !this.flag(FLAG_CARRY)),
                P(0x38, () => this.flag(FLAG_CARRY)),
            ],
            (condition) =>
                this.nextByte(
                    (value) => () =>
                        condition()
                            ? this.jumpr(
                                  () => <i8>value,
                                  () => null
                              )
                            : null
                )
        );

        // POP BC/DE/HL/AF
        generateOperation(
            [P(0xc1, this.regBC), P(0xd1, this.regDE), P(0xe1, this.regHL)],
            (r) =>
                this.pop((value) => () => {
                    r.set(value);
                    return null;
                })
        );
        // We need to mask lower 4 bits bc hardwired to 0
        this.instructionSet.set(
            0xf1,
            this.pop((value) => () => {
                this.regAF.set(value & 0xfff0);
                return null;
            })
        );

        // PUSH BC/DE/HL/AF
        generateOperation(
            [
                P(0xc5, this.regBC),
                P(0xd5, this.regDE),
                P(0xe5, this.regHL),
                P(0xf5, this.regAF),
            ],
            (register) =>
                this.push(
                    () => register.get(),
                    () => () => null
                )
        );

        // RLCA / RLA / RRCA / RRA
        this.instructionSet.set(0x07, () => {
            this.rotateLSr(this.srA, false, false);
            return null;
        });

        this.instructionSet.set(0x17, () => {
            this.rotateLSr(this.srA, true, false);
            return null;
        });

        this.instructionSet.set(0x0f, () => {
            this.rotateRSr(this.srA, false, false);
            return null;
        });

        this.instructionSet.set(0x1f, () => {
            this.rotateRSr(this.srA, true, false);
            return null;
        });

        // ADD SP, s8
        this.instructionSet.set(
            0xe8,
            this.nextByte((value) => () => {
                const s8 = <i8>value;
                const sp = this.regSP.get();
                this.regSP.set(this.perfAdd(s8, sp));
                return () => () => null; // 3 cycles (idk the timing yet)
            })
        );

        // LD HL, SP+s8
        this.instructionSet.set(
            0xf8,
            this.nextByte((value) => () => {
                const s8 = <i8>value;
                const sp = this.regSP.get();
                this.regHL.set(this.perfAdd(s8, sp));
                return () => null;
            })
        );

        // LD SP, HL
        this.instructionSet.set(0xf9, () => {
            this.regSP.set(this.regHL.get());
            return () => null;
        });

        // DI / EI
        this.instructionSet.set(0xf3, (system) => {
            system.getInterrupts().disableInterrupts();
            return null;
        });
        this.instructionSet.set(0xfb, (system) => {
            system.getInterrupts().enableInterrupts();
            return null;
        });

        // HALT
        this.instructionSet.set(0x76, (system) => {
            const interrupts = system.getInterrupts();
            this.halted = true;
            if (!interrupts.fastEnableInterrupts() && interrupts.hasPendingInterrupt) {
                this.haltBug = true; // halt bug triggered on HALT when IME == 0 & IE&IF != 0
            }
            return null;
        });

        // SCF / CCF
        this.instructionSet.set(0x37, () => {
            this.setFlag(FLAG_SUBSTRACTION, false);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_CARRY, true);
            return null;
        });
        this.instructionSet.set(0x3f, () => {
            this.setFlag(FLAG_SUBSTRACTION, false);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_CARRY, !this.flag(FLAG_CARRY));
            return null;
        });

        // DAA
        this.instructionSet.set(0x27, () => {
            let a: u8 = this.srA.get();
            let adjust = this.flag(FLAG_CARRY) ? 0x60 : 0x00;
            if (this.flag(FLAG_HALFCARRY)) {
                adjust |= 0x06;
            }
            if (!this.flag(FLAG_SUBSTRACTION)) {
                if ((a & 0x0f) > 0x09) adjust |= 0x06;
                if (a > 0x99) adjust |= 0x60;
            }

            a = a + (this.flag(FLAG_SUBSTRACTION) ? -adjust : adjust); // wraps
            this.srA.set(a);
            this.setFlag(FLAG_CARRY, adjust >= 0x60);
            this.setFlag(FLAG_HALFCARRY, false);
            this.setFlag(FLAG_ZERO, a === 0);
            return null;
        });

        // CPL
        this.instructionSet.set(0x2f, () => {
            this.srA.set(~this.srA.get() & 0xff);
            this.setFlag(FLAG_SUBSTRACTION, true);
            this.setFlag(FLAG_HALFCARRY, true);
            return null;
        });
    }

    /**
     * A list of all 16-bit opcodes. Works the same as instructionSet.
     */
    protected extendedInstructionSet: Int8Map<InstructionMethod> = new Map<
        u8,
        InstructionMethod
    >();

    protected generateExtendedOperationTable(): void {
        const generateExtendedOperation = this.generateExtendedOperation;

        // RLC ...
        this.generateExtendedOperation(0x00, (reg) =>
            reg.get((value) => reg.set(this.rotateL(value, false, true)))
        );
        // RRC ...
        this.generateExtendedOperation(0x08, (reg) =>
            reg.get((value) => reg.set(this.rotateR(value, false, true)))
        );
        // RL ...
        this.generateExtendedOperation(0x10, (reg) =>
            reg.get((value) => reg.set(this.rotateL(value, true, true)))
        );
        // RC ...
        this.generateExtendedOperation(0x18, (reg) =>
            reg.get((value) => reg.set(this.rotateR(value, true, true)))
        );

        // SLA ...
        this.generateExtendedOperation(0x20, (reg) =>
            reg.get((value) => {
                const result = (value << 1) & 0xff;
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, ((value >> 7) & 0b1) === 1);
                return reg.set(result);
            })
        );
        // SRA ...
        this.generateExtendedOperation(0x28, (reg) =>
            reg.get((value) => {
                const result = ((value >> 1) & 0xff) | (value & (1 << 7)); // bit 7 left unchanged
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, (value & 0b1) === 1);
                return reg.set(result);
            })
        );

        // SRL ...
        this.generateExtendedOperation(0x38, (reg) =>
            reg.get((value) => {
                const result = (value >> 1) & 0xff;
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, (value & 0b1) === 1);
                return reg.set(result);
            })
        );

        // SWAP ...
        this.generateExtendedOperation(0x30, (reg) =>
            reg.get((value) => {
                const result = ((value & 0x0f) << 4) | ((value & 0xf0) >> 4);
                this.setFlag(FLAG_ZERO, result === 0);
                this.setFlag(FLAG_SUBSTRACTION, false);
                this.setFlag(FLAG_HALFCARRY, false);
                this.setFlag(FLAG_CARRY, false);
                return reg.set(result);
            })
        );

        // BIT 0/1/2/.../7, ...
        for (let bit = 0; bit < 8; bit++) {
            this.generateExtendedOperation(0x40 + bit * 8, (reg) =>
                reg.get((value) => {
                    const out = (value >> bit) & 0b1;
                    this.setFlag(FLAG_ZERO, out === 0);
                    this.setFlag(FLAG_SUBSTRACTION, false);
                    this.setFlag(FLAG_HALFCARRY, true);
                    return null;
                })
            );
        }

        // RES 0/1/2/.../7, ...
        for (let bit = 0; bit < 8; bit++) {
            this.generateExtendedOperation(0x80 + bit * 8, (reg) =>
                reg.get((value) => {
                    const result = value & ~(1 << bit);
                    return reg.set(result);
                })
            );
        }

        // SET 0/1/2/.../7, ...
        for (let bit = 0; bit < 8; bit++) {
            this.generateExtendedOperation(0xc0 + bit * 8, (reg) =>
                reg.get((value) => {
                    const result = value | (1 << bit);
                    return reg.set(result);
                })
            );
        }
    }

    // Helper functions for instructions
    /** Reads flags */
    protected flag(flag: u8): boolean {
        return this.regAF.l.flag(flag);
    }
    /** Sets flags */
    protected setFlag(flag: u8, state: boolean): void {
        this.regAF.l.sflag(flag, state);
    }
    /** Increments an 8bit value (wrapping), updates flags Z/0/H */
    protected incN(n: u8): u8 {
        const result = /*wrap8*/ n + 1;
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) < (n & 0xf));
        return result;
    }
    /** Applies `incN` to a sub-register */
    protected incSr(sr: SubRegister): void {
        sr.set(this.incN(sr.get()));
    }

    /** Decrements an 8bit value (wrapping), updates flags Z/1/H */
    protected decN(n: u8): u8 {
        const result = /*wrap8*/ n - 1;
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) > (n & 0xf));
        return result;
    }

    /** Applies `decN` to a sub-register */
    protected decSr(sr: SubRegister): void {
        sr.set(this.decN(sr.get()));
    }

    /** Add a register to HL, updates flags 0/H/CY */
    protected addRToHL(register: Register): void {
        const hl = this.regHL.get();
        const n = register.get();
        const result = /*wrap16*/ hl + n;
        this.regHL.set(result);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (((hl & 0xfff) + (n & 0xfff)) & 0x1000) != 0);
        this.setFlag(FLAG_CARRY, hl > 0xffff - n);
    }
    /** Adds a value to subregister A, updates flags Z/0/H/CY */
    protected addNToA(n: u8, carry: boolean): void {
        const a = this.srA.get();
        const carryVal = carry && this.flag(FLAG_CARRY) ? 1 : 0;
        const result = /*wrap8*/ a + n + carryVal;
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) + (n & 0xf) + carryVal > 0xf);
        this.setFlag(FLAG_CARRY, a + n + carryVal > 0xff);
    }
    /** Adds the two given 16-bit values (updating flags), returns the result */
    protected perfAdd(a: u16, b: u16): u16 {
        const result = /*wrap16*/ a + b;
        this.setFlag(FLAG_ZERO, false);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_CARRY, (a & 0xff) > 0xff - (b & 0xff));
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) > 0xf - (b & 0xf));
        return result;
    }
    /** Substracts a value from subregister A, updates flags Z/1/H/CY */
    protected subNFromA(n: number, carry: boolean): void {
        const a = this.srA.get();
        const carryVal = carry && this.flag(FLAG_CARRY) ? 1 : 0;
        const result = /*wrap8*/ a - n - carryVal;
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) - (n & 0xf) - carryVal < 0);
        this.setFlag(FLAG_CARRY, a - n - carryVal < 0);
    }
    /** Stores the given boolean operation of A and the given value in A, updates Z/0/H/0 */
    protected boolNToA(n: number, op: "&" | "|" | "^"): void {
        const a = this.srA.get();
        const result = op === "&" ? a & n : op === "|" ? a | n : a ^ n;
        this.srA.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, op === "&");
        this.setFlag(FLAG_CARRY, false);
    }
    /** Compares the given number with the value in A without changing A, updates Z/1/H/CY */
    protected compNToA(n: number): void {
        const a = this.srA.get();
        this.subNFromA(n, false);
        this.srA.set(a);
    }
    /**
     * Pushes the given data to the stack pointer's position, and moves it back by two
     * Takes 3 cycles
     */
    protected push(data: () => number, receiver: () => InstructionReturn): InstructionMethod {
        return () => (system) => {
            const effectiveData = data();
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
        return this.pop((value) => (s) => {
            this.regPC.set(value);
            return receiver(s);
        });
    }
    /**
     * Jumps to the given 16bit address
     * Takes one cycle
     */
    protected jump(n: () => number, receiver: () => InstructionReturn): InstructionMethod {
        return () => {
            const address = n();
            this.regPC.set(address);
            return receiver();
        };
    }
    /**
     * Relative-jumps by the given 8-bit value
     * Takes one cycle
     */
    protected jumpr(n: () => number, receiver: () => InstructionReturn): InstructionMethod {
        return () => {
            const address = n();
            this.regPC.set(/*wrap16*/ this.regPC.get() + address);
            return receiver();
        };
    }
    /** Rotates the given number left. Sets flags Z|0/0/0/N7 */
    protected rotateL(n: number, useCarry: boolean, setZero: boolean): u8 {
        const bit7 = (n >> 7) & 0b1;
        const cflag = this.flag(FLAG_CARRY) ? 1 : 0;
        const result = ((n << 1) & 0xff) | (useCarry ? cflag : bit7);
        this.setFlag(FLAG_ZERO, setZero && result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, false);
        this.setFlag(FLAG_CARRY, bit7 === 1);
        return result;
    }
    /** Applies rotateL to a subregister. Sets flags Z|0/0/0/Sr7 */
    protected rotateLSr(sr: SubRegister, useCarry: boolean, setZero: boolean): void {
        sr.set(this.rotateL(sr.get(), useCarry, setZero));
    }
    /** Rotates the given number right. Sets flags Z|0/0/0/N0 */
    protected rotateR(n: number, useCarry: boolean, setZero: boolean): u8 {
        const bit0 = n & 0b1;
        const cflag = this.flag(FLAG_CARRY) ? 1 : 0;
        const result = ((n >> 1) & 0xff) | ((useCarry ? cflag : bit0) << 7);
        this.setFlag(FLAG_ZERO, setZero && result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, false);
        this.setFlag(FLAG_CARRY, bit0 === 1);
        return result;
    }
    /** Applies rotateR to a subregister. Sets flags Z|0/0/0/Sr0 */
    protected rotateRSr(sr: SubRegister, useCarry: boolean, setZero: boolean): void {
        sr.set(this.rotateR(sr.get(), useCarry, setZero));
    }

    /** Small helper to make tuples */
    P<A, B>(a: A, b: B): Tuple<A, B> {
        return new Tuple(a, b);
    }

    /**
     * Helper function for instructions that do the same operations for a set of objects.
     * @param items The object the operation runs on, matched to its opcode.
     * @param execute A function that executes the instruction for a given object.
     * @returns An object with the completed instructions
     */
    protected generateOperation<T>(
        items: Tuple<u8, T>[],
        execute: (r: T) => InstructionMethod
    ): void {
        for (let i = 0; i < items.length; i++) {
            const opcode = items[i].a;
            const item = items[i].b;
            this.instructionSet.set(opcode, execute(item));
        }
    }

    /**
     * Helper function for instructions that follow the same B-C-D-E-H-L-(HL)-A pattern
     * @param baseCode The base code of the instruction (e.g. 0x50)
     * @param execute A function that executes the instruction for a given register
     * @returns An object with the completed instructions (e.g. 0x50, 0x51, ..., 0x57)
     */
    protected generateExtendedOperation(
        baseCode: u8,
        execute: (r: CPURegister) => InstructionReturn
    ): void {
        function make(sr: SubRegister): CPURegister {
            return new CPURegister(
                (r: (value: number) => InstructionReturn) => {
                    const value = sr.get();
                    return r(value);
                },
                (x: number) => {
                    sr.set(x);
                    return null;
                }
            );
        }
        const regB = make(this.srB);
        const regC = make(this.srC);
        const regD = make(this.srD);
        const regE = make(this.srE);
        const regH = make(this.srH);
        const regL = make(this.srL);
        const regA = make(this.srA);

        function hlReg(cpu: CPU, system: System) {
            return new CPURegister(
                (r: (value: number) => InstructionReturn) => {
                    const value = system.read(cpu.regHL.get());
                    return () => r(value);
                },
                (x: number) => {
                    system.write(cpu.regHL.get(), x);
                    return () => null;
                }
            );
        }
        // order matters: B/C/D/E/H/L/(HL)/A
        this.extendedInstructionSet.set(baseCode + 0, (s) => execute(regB));
        this.extendedInstructionSet.set(baseCode + 1, (s) => execute(regC));
        this.extendedInstructionSet.set(baseCode + 2, (s) => execute(regD));
        this.extendedInstructionSet.set(baseCode + 3, (s) => execute(regE));
        this.extendedInstructionSet.set(baseCode + 4, (s) => execute(regH));
        this.extendedInstructionSet.set(baseCode + 5, (s) => execute(regL));
        this.extendedInstructionSet.set(baseCode + 6, (s) => execute(hlReg(this, s)));
        this.extendedInstructionSet.set(baseCode + 7, (s) => execute(regA));
    }
}

class CPURegister {
    constructor(
        public get: (r: (value: number) => InstructionReturn) => InstructionReturn,
        public set: (x: number) => InstructionReturn
    ) {}
}

export default CPU;
