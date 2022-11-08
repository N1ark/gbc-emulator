import { Register, SubRegister } from "./Register";
import System from "./System";
import { combine, high, low, wrap16, wrap8 } from "./util";

const FLAG_ZERO = 1 << 3;
const FLAG_SUBSTRACTION = 1 << 2;
const FLAG_HALFCARRY = 1 << 1;
const FLAG_CARRY = 1 << 0;

type SubRegisterName = "a" | "b" | "c" | "d" | "e" | "f" | "h" | "l";
type InstructionObject = (system: System) => number;

/**
 * The CPU of the GBC, responsible for reading the code and executing instructions.
 */
class CPU {
    // All registers are 16 bits long.
    protected regAF = new Register(0); // lower is flags: ZNHC (zero, substraction, half-carry, carry)
    protected regBC = new Register(0);
    protected regDE = new Register(0);
    protected regHL = new Register(0);
    protected regSP = new Register(0); // stack pointer
    protected regPC = new Register(0); // program counter

    protected nextByte(system: System) {
        return system.read(this.regPC.inc());
    }

    protected nextWord(system: System) {
        const low = this.nextByte(system);
        const high = this.nextByte(system);
        return combine(high, low);
    }

    protected handleInterrupts(system: System) {}

    /**
     * Steps through one line of the code, and returns the clock cycles required for the
     * operation
     */
    step(system: System): number {
        const opcode = this.nextByte(system);
        const instruction = this.instructionSet[opcode];
        if (instruction === undefined) {
            throw Error(`Unrecognized opcode ${opcode} at address ${this.regPC}`);
        }

        const cycles = instruction(system) * 4;
        return cycles;
    }

    /* prettier-ignore */
    /**
     * A list of all 8-bit opcodes.
     * Each callable executes the instruction, and returns the number of M-cycles that the
     * instruction took.
     * @link https://meganesulli.com/generate-gb-opcodes/
     * */
    protected instructionSet: Partial<Record<number, InstructionObject>> = {
        0x00: () => 1, // nop
    }
}

export default CPU;
