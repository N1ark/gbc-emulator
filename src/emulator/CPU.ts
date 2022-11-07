import System from "./System";

class CPU {
    // 8-bit registers
    protected regA: number = 0;
    protected regB: number = 0;
    protected regC: number = 0;
    protected regD: number = 0;
    protected regE: number = 0;
    protected regF: number = 0;
    protected regH: number = 0;
    protected regL: number = 0;

    // 16-bit registers
    protected regSP: number = 0; // stack pointer
    protected regPC: number = 0; // program counter

    protected nextByte(system: System) {
        return system.read(this.regPC++);
    }

    protected handleInterrupts(system: System) {}

    /**
     * Steps through one line of the code, and returns the clock cycles required for the
     * operation
     */
    step(system: System): number {
        const opcode = this.nextByte(system);
        switch (opcode) {
            // one case per opcode
            default:
                return 8;
            // throw Error(`Unrecognized opcode ${opcode} at address ${this.regPC}`);
        }
    }
}

export default CPU;
