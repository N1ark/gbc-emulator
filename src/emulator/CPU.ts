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
    // AF: lower is flags: ZNHC (zero, substraction, half-carry, carry)
    protected regAF: Register;
    protected regBC: Register;
    protected regDE: Register;
    protected regHL: Register;
    protected regPC: Register; // program counter
    protected regSP: Register; // stack pointer

    constructor() {
        this.regAF = new Register(0x01, 0b1000);
        this.regBC = new Register(0x00, 0x13);
        this.regDE = new Register(0x00, 0xd8);
        this.regHL = new Register(0x01, 0x4d);
        this.regPC = new Register(0x0100); // program counter
        this.regSP = new Register(0xfffe); // stack pointer
    }

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
        // LD dd, nn
        0x01: (s) => { this.regBC.set(this.nextWord(s)); return 3; },
        0x11: (s) => { this.regDE.set(this.nextWord(s)); return 3; },
        0x21: (s) => { this.regHL.set(this.nextWord(s)); return 3; },
        0x31: (s) => { this.regSP.set(this.nextWord(s)); return 3; },
        // INC BC/DE/HL/SP
        0x03: () => { this.regBC.inc(); return 2; },
        0x13: () => { this.regDE.inc(); return 2; },
        0x23: () => { this.regHL.inc(); return 2; },
        0x33: () => { this.regSP.inc(); return 2; },
        // DEC BC/DE/HL/SP
        0x0b: () => { this.regBC.dec(); return 2; },
        0x1b: () => { this.regDE.dec(); return 2; },
        0x2b: () => { this.regHL.dec(); return 2; },
        0x3b: () => { this.regSP.dec(); return 2; },
        // ADD HL, BC/DE/HL/SP
        0x09: () => { this.addRToHL(this.regBC); return 2; },
        0x19: () => { this.addRToHL(this.regDE); return 2; },
        0x29: () => { this.addRToHL(this.regHL); return 2; },
        0x39: () => { this.addRToHL(this.regSP); return 2; },
        // INC B/D/H/C/E/L/A
        0x04: () => { this.incSr("b"); return 1; },
        0x14: () => { this.incSr("d"); return 1; },
        0x24: () => { this.incSr("h"); return 1; },
        0x0c: () => { this.incSr("c"); return 1; },
        0x1c: () => { this.incSr("e"); return 1; },
        0x2c: () => { this.incSr("l"); return 1; },
        0x3c: () => { this.incSr("a"); return 1; },
        // INC (HL)
        0x34: (s) => {
            const hl = this.regHL.get();
            s.write(hl, this.incN(s.read(hl)));
            return 3;
        },
        // DEC B/D/H/C/E/L/A
        0x05: () => { this.decSr("b"); return 1; },
        0x15: () => { this.decSr("d"); return 1; },
        0x25: () => { this.decSr("h"); return 1; },
        0x0d: () => { this.decSr("c"); return 1; },
        0x1d: () => { this.decSr("e"); return 1; },
        0x2d: () => { this.decSr("l"); return 1; },
        0x3d: () => { this.decSr("a"); return 1; },
        // DEC (HL)
        0x35: (s) => {
            const hl = this.regHL.get();
            s.write(hl, this.decN(s.read(hl)));
            return 3;
        },
        // LD (BC/DE/HL+/HL-), A
        0x02: (s) => { s.write(this.regBC.get(), this.regAF.h.get()); return 2; },
        0x12: (s) => { s.write(this.regDE.get(), this.regAF.h.get()); return 2; },
        0x22: (s) => { s.write(this.regHL.inc(), this.regAF.h.get()); return 2; },
        0x32: (s) => { s.write(this.regHL.dec(), this.regAF.h.get()); return 2; },
        // LD A, (BC/DE/HL+/HL-)
        0x0a: (s) => { this.regAF.h.set(s.read(this.regBC.get())); return 2; },
        0x1a: (s) => { this.regAF.h.set(s.read(this.regDE.get())); return 2; },
        0x2a: (s) => { this.regAF.h.set(s.read(this.regHL.inc())); return 2; },
        0x3a: (s) => { this.regAF.h.set(s.read(this.regBC.dec())); return 2; },
        // LD B/D/H/C/E/L/A, d8
        0x06: (s) => { this.sr("b").set(this.nextByte(s)); return 2; },
        0x16: (s) => { this.sr("d").set(this.nextByte(s)); return 2; },
        0x26: (s) => { this.sr("h").set(this.nextByte(s)); return 2; },
        0x0e: (s) => { this.sr("c").set(this.nextByte(s)); return 2; },
        0x1e: (s) => { this.sr("e").set(this.nextByte(s)); return 2; },
        0x2e: (s) => { this.sr("l").set(this.nextByte(s)); return 2; },
        0x3e: (s) => { this.sr("a").set(this.nextByte(s)); return 2; },
        // LD (HL), d8
        0x36: (s) => { s.write(this.regHL.get(), this.nextByte(s)); return 3; },
        // LD (a16), SP
        0x08: (s) => {
            const a = this.nextWord(s);
            s.write(a, this.regSP.l.get());
            s.write(a + 1, this.regSP.h.get());
            return 5;
        },
        // LD B, B/C/D/E/H/L/(HL)/A
        0x40: () => { this.loadSrToSr("b", "b"); return 1; },
        0x41: () => { this.loadSrToSr("b", "c"); return 1; },
        0x42: () => { this.loadSrToSr("b", "d"); return 1; },
        0x43: () => { this.loadSrToSr("b", "e"); return 1; },
        0x44: () => { this.loadSrToSr("b", "h"); return 1; },
        0x45: () => { this.loadSrToSr("b", "l"); return 1; },
        0x46: (s) => { this.sr("b").set(s.read(this.regHL.get())); return 2; },
        0x47: () => { this.loadSrToSr("b", "a"); return 1; },
        // LD C, B/C/D/E/H/L/(HL)/A
        0x48: () => { this.loadSrToSr("c", "b"); return 1; },
        0x49: () => { this.loadSrToSr("c", "c"); return 1; },
        0x4a: () => { this.loadSrToSr("c", "d"); return 1; },
        0x4b: () => { this.loadSrToSr("c", "e"); return 1; },
        0x4c: () => { this.loadSrToSr("c", "h"); return 1; },
        0x4d: () => { this.loadSrToSr("c", "l"); return 1; },
        0x4e: (s) => { this.sr("c").set(s.read(this.regHL.get())); return 2; },
        0x4f: () => { this.loadSrToSr("c", "a"); return 1; },
        // LD D, B/C/D/E/H/L/(HL)/A
        0x50: () => { this.loadSrToSr("d", "b"); return 1; },
        0x51: () => { this.loadSrToSr("d", "c"); return 1; },
        0x52: () => { this.loadSrToSr("d", "d"); return 1; },
        0x53: () => { this.loadSrToSr("d", "e"); return 1; },
        0x54: () => { this.loadSrToSr("d", "h"); return 1; },
        0x55: () => { this.loadSrToSr("d", "l"); return 1; },
        0x56: (s) => { this.sr("d").set(s.read(this.regHL.get())); return 2; },
        0x57: () => { this.loadSrToSr("d", "a"); return 1; },
        // LD E, B/C/D/E/H/L/(HL)/A
        0x58: () => { this.loadSrToSr("e", "b"); return 1; },
        0x59: () => { this.loadSrToSr("e", "c"); return 1; },
        0x5a: () => { this.loadSrToSr("e", "d"); return 1; },
        0x5b: () => { this.loadSrToSr("e", "e"); return 1; },
        0x5c: () => { this.loadSrToSr("e", "h"); return 1; },
        0x5d: () => { this.loadSrToSr("e", "l"); return 1; },
        0x5e: (s) => { this.sr("e").set(s.read(this.regHL.get())); return 2; },
        0x5f: () => { this.loadSrToSr("e", "a"); return 1; },
        // LD H, B/C/D/E/H/L/(HL)/A
        0x60: () => { this.loadSrToSr("h", "b"); return 1; },
        0x61: () => { this.loadSrToSr("h", "c"); return 1; },
        0x62: () => { this.loadSrToSr("h", "d"); return 1; },
        0x63: () => { this.loadSrToSr("h", "e"); return 1; },
        0x64: () => { this.loadSrToSr("h", "h"); return 1; },
        0x65: () => { this.loadSrToSr("h", "l"); return 1; },
        0x66: (s) => { this.sr("h").set(s.read(this.regHL.get())); return 2; },
        0x67: () => { this.loadSrToSr("h", "a"); return 1; },
        // LD L, B/C/D/E/H/L/(HL)/A
        0x68: () => { this.loadSrToSr("l", "b"); return 1; },
        0x69: () => { this.loadSrToSr("l", "c"); return 1; },
        0x6a: () => { this.loadSrToSr("l", "d"); return 1; },
        0x6b: () => { this.loadSrToSr("l", "e"); return 1; },
        0x6c: () => { this.loadSrToSr("l", "h"); return 1; },
        0x6d: () => { this.loadSrToSr("l", "l"); return 1; },
        0x6e: (s) => { this.sr("l").set(s.read(this.regHL.get())); return 2; },
        0x6f: () => { this.loadSrToSr("l", "a"); return 1; },
        // LD A, B/C/D/E/H/L/(HL)/A
        0x78: () => { this.loadSrToSr("a", "b"); return 1; },
        0x79: () => { this.loadSrToSr("a", "c"); return 1; },
        0x7a: () => { this.loadSrToSr("a", "d"); return 1; },
        0x7b: () => { this.loadSrToSr("a", "e"); return 1; },
        0x7c: () => { this.loadSrToSr("a", "h"); return 1; },
        0x7d: () => { this.loadSrToSr("a", "l"); return 1; },
        0x7e: (s) => { this.sr("a").set(s.read(this.regHL.get())); return 2; },
        0x7f: () => { this.loadSrToSr("a", "a"); return 1; },
        // LD (HL), B/C/D/E/H/L/A
        0x70: (s) => { s.write(this.regHL.get(), this.sr("b").get()); return 2; },
        0x71: (s) => { s.write(this.regHL.get(), this.sr("c").get()); return 2; },
        0x72: (s) => { s.write(this.regHL.get(), this.sr("d").get()); return 2; },
        0x73: (s) => { s.write(this.regHL.get(), this.sr("e").get()); return 2; },
        0x74: (s) => { s.write(this.regHL.get(), this.sr("h").get()); return 2; },
        0x75: (s) => { s.write(this.regHL.get(), this.sr("l").get()); return 2; },
        0x77: (s) => { s.write(this.regHL.get(), this.sr("a").get()); return 2; },
        // ADD A, B/C/D/E/H/L/A/(HL)/d8
        0x80: () => { this.addNToA(this.sr("b").get(), false); return 1; },
        0x81: () => { this.addNToA(this.sr("c").get(), false); return 1; },
        0x82: () => { this.addNToA(this.sr("d").get(), false); return 1; },
        0x83: () => { this.addNToA(this.sr("e").get(), false); return 1; },
        0x84: () => { this.addNToA(this.sr("h").get(), false); return 1; },
        0x85: () => { this.addNToA(this.sr("l").get(), false); return 1; },
        0x87: () => { this.addNToA(this.sr("a").get(), false); return 1; },
        0x86: (s) => { this.addNToA(s.read(this.regHL.get()), false); return 2; },
        0xc6: (s) => { this.addNToA(this.nextByte(s), false); return 2; },
        // ADDC A, B/C/D/E/H/L/A/(HL)/d8
        0x88: () => { this.addNToA(this.sr("b").get(), true); return 1; },
        0x89: () => { this.addNToA(this.sr("c").get(), true); return 1; },
        0x8a: () => { this.addNToA(this.sr("d").get(), true); return 1; },
        0x8b: () => { this.addNToA(this.sr("e").get(), true); return 1; },
        0x8c: () => { this.addNToA(this.sr("h").get(), true); return 1; },
        0x8d: () => { this.addNToA(this.sr("l").get(), true); return 1; },
        0x8f: () => { this.addNToA(this.sr("a").get(), true); return 1; },
        0x8e: (s) => { this.addNToA(s.read(this.regHL.get()), true); return 2; },
        0xce: (s) => { this.addNToA(this.nextByte(s), true); return 2; },
        // SUB A, B/C/D/E/H/L/A/(HL)/d8
        0x90: () => { this.subNFromA(this.sr("b").get(), false); return 1; },
        0x91: () => { this.subNFromA(this.sr("c").get(), false); return 1; },
        0x92: () => { this.subNFromA(this.sr("d").get(), false); return 1; },
        0x93: () => { this.subNFromA(this.sr("e").get(), false); return 1; },
        0x94: () => { this.subNFromA(this.sr("h").get(), false); return 1; },
        0x95: () => { this.subNFromA(this.sr("l").get(), false); return 1; },
        0x97: () => { this.subNFromA(this.sr("a").get(), false); return 1; },
        0x96: (s) => { this.subNFromA(s.read(this.regHL.get()), false); return 2; },
        0xd6: (s) => { this.subNFromA(this.nextByte(s), false); return 2; },
        // SBC A, B/C/D/E/H/L/A/(HL)/d8
        0x98: () => { this.subNFromA(this.sr("b").get(), true); return 1; },
        0x99: () => { this.subNFromA(this.sr("c").get(), true); return 1; },
        0x9a: () => { this.subNFromA(this.sr("d").get(), true); return 1; },
        0x9b: () => { this.subNFromA(this.sr("e").get(), true); return 1; },
        0x9c: () => { this.subNFromA(this.sr("h").get(), true); return 1; },
        0x9d: () => { this.subNFromA(this.sr("l").get(), true); return 1; },
        0x9f: () => { this.subNFromA(this.sr("a").get(), true); return 1; },
        0x9e: (s) => { this.subNFromA(s.read(this.regHL.get()), true); return 2; },
        0xde: (s) => { this.subNFromA(this.nextByte(s), true); return 2; },
        // AND B/C/D/E/H/L/A/(HL)/d8
        0xa0: () => { this.boolNToA(this.sr("b").get(), "&"); return 1; },
        0xa1: () => { this.boolNToA(this.sr("c").get(), "&"); return 1; },
        0xa2: () => { this.boolNToA(this.sr("d").get(), "&"); return 1; },
        0xa3: () => { this.boolNToA(this.sr("e").get(), "&"); return 1; },
        0xa4: () => { this.boolNToA(this.sr("h").get(), "&"); return 1; },
        0xa5: () => { this.boolNToA(this.sr("l").get(), "&"); return 1; },
        0xa7: () => { this.boolNToA(this.sr("a").get(), "&"); return 1; },
        0xa6: (s) => { this.boolNToA(s.read(this.regHL.get()), "&"); return 2; },
        0xe6: (s) => { this.boolNToA(this.nextByte(s), "&"); return 2; },
        // XOR B/C/D/E/H/L/A/(HL)/d8
        0xa8: () => { this.boolNToA(this.sr("b").get(), "^"); return 1; },
        0xa9: () => { this.boolNToA(this.sr("c").get(), "^"); return 1; },
        0xaa: () => { this.boolNToA(this.sr("d").get(), "^"); return 1; },
        0xab: () => { this.boolNToA(this.sr("e").get(), "^"); return 1; },
        0xac: () => { this.boolNToA(this.sr("h").get(), "^"); return 1; },
        0xad: () => { this.boolNToA(this.sr("l").get(), "^"); return 1; },
        0xaf: () => { this.boolNToA(this.sr("a").get(), "^"); return 1; },
        0xae: (s) => { this.boolNToA(s.read(this.regHL.get()), "^"); return 2; },
        0xee: (s) => { this.boolNToA(this.nextByte(s), "^"); return 2; },
        // OR B/C/D/E/H/L/A/(HL)/d8
        0xb0: () => { this.boolNToA(this.sr("b").get(), "|"); return 1; },
        0xb1: () => { this.boolNToA(this.sr("c").get(), "|"); return 1; },
        0xb2: () => { this.boolNToA(this.sr("d").get(), "|"); return 1; },
        0xb3: () => { this.boolNToA(this.sr("e").get(), "|"); return 1; },
        0xb4: () => { this.boolNToA(this.sr("h").get(), "|"); return 1; },
        0xb5: () => { this.boolNToA(this.sr("l").get(), "|"); return 1; },
        0xb7: () => { this.boolNToA(this.sr("a").get(), "|"); return 1; },
        0xb6: (s) => { this.boolNToA(s.read(this.regHL.get()), "|"); return 2; },
        0xf6: (s) => { this.boolNToA(this.nextByte(s), "|"); return 2; },
        // CP B/C/D/E/H/L/A/(HL)/d8
        0xb8: () => { this.boolNToA(this.sr("b").get(), "|"); return 1; },
        0xb9: () => { this.boolNToA(this.sr("c").get(), "|"); return 1; },
        0xba: () => { this.boolNToA(this.sr("d").get(), "|"); return 1; },
        0xbb: () => { this.boolNToA(this.sr("e").get(), "|"); return 1; },
        0xbc: () => { this.boolNToA(this.sr("h").get(), "|"); return 1; },
        0xbd: () => { this.boolNToA(this.sr("l").get(), "|"); return 1; },
        0xbf: () => { this.boolNToA(this.sr("a").get(), "|"); return 1; },
        0xbe: (s) => { this.boolNToA(s.read(this.regHL.get()), "|"); return 2; },
        0xfe: (s) => { this.boolNToA(this.nextByte(s), "|"); return 2; },
        // LD (a8), A
        0xe0: (s) => { s.write(0xff00 | this.nextByte(s), this.regAF.h.get()); return 3; },
        // LD A, (a8)
        0xf0: (s) => { this.regAF.h.set(s.read(0xff00 | this.nextByte(s))); return 3; },
        // LD (C), A
        0xe2: (s) => { s.write(0xff00 | this.sr("c").get(), this.regAF.h.get()); return 2; },
        // LD A, (C)
        0xf2: (s) => { this.regAF.h.set(s.read(0xff00 | this.sr("c").get())); return 2; },
        // LD (a16), A
        0xea: (s) => { s.write(0xff00 | this.nextWord(s), this.regAF.h.get()); return 4; },
        // LD A, (a16)
        0xfa: (s) => { this.regAF.h.set(s.read(0xff00 | this.nextWord(s))); return 4; },
        // RST 0/1/2/3/4/5/6/7
        0xc7: (s) => { this.call(s, 0x00); return 4; },
        0xcf: (s) => { this.call(s, 0x08); return 4; },
        0xd7: (s) => { this.call(s, 0x10); return 4; },
        0xdf: (s) => { this.call(s, 0x18); return 4; },
        0xe7: (s) => { this.call(s, 0x20); return 4; },
        0xef: (s) => { this.call(s, 0x28); return 4; },
        0xf7: (s) => { this.call(s, 0x30); return 4; },
        0xff: (s) => { this.call(s, 0x38); return 4; },
        // CALL a16
        0xcd: (s) => { this.call(s, this.nextWord(s)); return 6; },
        // CALL Z/C/NZ/NC a16
        0xcc: (s) => { const a = this.nextWord(s); if(this.flag(FLAG_ZERO)) { this.call(s, a); return 6; } return 3; },
        0xdc: (s) => { const a = this.nextWord(s); if(this.flag(FLAG_CARRY)) { this.call(s, a); return 6; } return 3; },
        0xc4: (s) => { const a = this.nextWord(s); if(!this.flag(FLAG_ZERO)) { this.call(s, a); return 6; } return 3; },
        0xd4: (s) => { const a = this.nextWord(s); if(!this.flag(FLAG_CARRY)) { this.call(s, a); return 6; } return 3; },
        // RET
        0xc9: (s) => { this.return(s); return 4; },
        // RET Z/C/NZ/NC
        0xc8: (s) => { if(this.flag(FLAG_ZERO)) { this.return(s); return 5; } return 2; },
        0xd8: (s) => { if(this.flag(FLAG_CARRY)) { this.return(s); return 5; } return 2; },
        0xc0: (s) => { if(!this.flag(FLAG_ZERO)) { this.return(s); return 5; } return 2; },
        0xd0: (s) => { if(!this.flag(FLAG_CARRY)) { this.return(s); return 5; } return 2; },
        // JP a16
        0xc3: (s) => { this.jump(this.nextWord(s)); return 4; },
        // JP HL
        0xd9: (s) => { this.jump(this.regHL.get()); return 1; },
        // JP Z/C/NZ/NC, a16
        0xca: (s) => { const a = this.nextWord(s); if(this.flag(FLAG_ZERO)) { this.jump(a); return 4; } return 3; },
        0xda: (s) => { const a = this.nextWord(s); if(this.flag(FLAG_CARRY)) { this.jump(a); return 4; } return 3; },
        0xc2: (s) => { const a = this.nextWord(s); if(!this.flag(FLAG_ZERO)) { this.jump(a); return 4; } return 3; },
        0xd2: (s) => { const a = this.nextWord(s); if(!this.flag(FLAG_CARRY)) { this.jump(a); return 4; } return 3; },
        // JR s8
        0x18: (s) => { this.jumpr(this.nextByte(s)); return 3; },
        // JR Z/C/NZ/NC, s8
        0x28: (s) => { const a = this.nextByte(s); if(this.flag(FLAG_ZERO)) { this.jumpr(a); return 3; } return 2; },
        0x38: (s) => { const a = this.nextByte(s); if(this.flag(FLAG_CARRY)) { this.jumpr(a); return 3; } return 2; },
        0x20: (s) => { const a = this.nextByte(s); if(!this.flag(FLAG_ZERO)) { this.jumpr(a); return 3; } return 2; },
        0x30: (s) => { const a = this.nextByte(s); if(!this.flag(FLAG_CARRY)) { this.jumpr(a); return 3; } return 2; },
        // POP BC/DE/HL/AF
        0xc1: (s) => { this.regBC.set(this.pop(s)); return 3; },
        0xd1: (s) => { this.regDE.set(this.pop(s)); return 3; },
        0xe1: (s) => { this.regHL.set(this.pop(s)); return 3; },
        0xf1: (s) => { this.regAF.set(this.pop(s)); return 3; },
        // PUSH BC/DE/HL/AF
        0xc5: (s) => { this.push(s, this.regBC.get()); return 4; },
        0xd5: (s) => { this.push(s, this.regDE.get()); return 4; },
        0xe5: (s) => { this.push(s, this.regHL.get()); return 4; },
        0xf5: (s) => { this.push(s, this.regAF.get()); return 4; },
        // RLCA / RLA / RRCA / RRA
        0x07: () => { this.rotateLSr("a", false, false); return 1; },
        0x17: () => { this.rotateLSr("a", true, false); return 1; },
        0x0f: () => { this.rotateRSr("a", false, false); return 1; },
        0x1f: () => { this.rotateRSr("a", true, false); return 1; },
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
    /** Returns the subregister with the given name */
    protected sr(n: SubRegisterName): SubRegister {
        return {
            a: this.regAF.h,
            f: this.regAF.l,
            b: this.regBC.h,
            c: this.regBC.l,
            d: this.regDE.h,
            e: this.regDE.l,
            h: this.regHL.h,
            l: this.regHL.l,
        }[n];
    }
    /** Increments an 8bit value (wrapping), updates flags Z/0/H */
    protected incN(n: number): number {
        const result = wrap8(n + 1);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) === 0xf);
        return result;
    }
    /** Applies `incN` to a sub-register */
    protected incSr(name: SubRegisterName) {
        const sr = this.sr(name);
        sr.set(this.incN(sr.get()));
    }

    /** Decrements an 8bit value (wrapping), updates flags Z/1/H */
    protected decN(n: number): number {
        const result = wrap8(n - 1);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (result & 0xf) === 0);
        return result;
    }
    /** Applies `decN` to a sub-register */
    protected decSr(name: SubRegisterName) {
        const sr = this.sr(name);
        sr.set(this.decN(sr.get()));
    }

    /** Add a register to HL, updates flags 0/H/CY */
    protected addRToHL(register: Register) {
        const hl = this.regHL.get();
        const n = register.get();
        const result = wrap16(hl + n);
        this.regHL.set(result);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (((hl & 0xfff) + (n & 0xfff)) & 0x1000) != 0);
        this.setFlag(FLAG_CARRY, hl > 0xffff - n);
    }
    /** Loads a subregister into another */
    protected loadSrToSr(to: SubRegisterName, from: SubRegisterName) {
        this.sr(to).set(this.sr(from).get());
    }
    /** Adds a value to subregister A, updates flags Z/0/H/CY */
    protected addNToA(n: number, carry: boolean) {
        const a = this.regAF.h.get();
        const carryVal = carry && this.regAF.l.flag(FLAG_CARRY) ? 1 : 0;
        const result = wrap8(a + n + carryVal);
        this.regAF.h.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) + (n & 0xf) + carryVal > 0xf);
        this.setFlag(FLAG_CARRY, a + n + carryVal > 0xff);
    }
    /** Substracts a value from subregister A, updates flags Z/1/H/CY */
    protected subNFromA(n: number, carry: boolean) {
        const a = this.regAF.h.get();
        const carryVal = carry && this.regAF.l.flag(FLAG_CARRY) ? 1 : 0;
        const result = wrap8(a - n - carryVal);
        this.regAF.h.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, true);
        this.setFlag(FLAG_HALFCARRY, (a & 0xf) - (n & 0xf) - carryVal < 0);
        this.setFlag(FLAG_CARRY, a - n - carryVal < 0);
    }
    /** Stores the given boolean operation of A and the given value in A, updates Z/0/H/0 */
    protected boolNToA(n: number, op: "&" | "|" | "^") {
        const a = this.regAF.h.get();
        const result = op === "&" ? a & n : op === "|" ? a | n : a ^ n;
        this.regAF.h.set(result);
        this.setFlag(FLAG_ZERO, result === 0);
        this.setFlag(FLAG_SUBSTRACTION, false);
        this.setFlag(FLAG_HALFCARRY, op === "&");
        this.setFlag(FLAG_CARRY, false);
    }
    /** Compares the given number with the value in A without changing A, updates Z/1/H/CY */
    protected compNToA(n: number) {
        const a = this.regAF.h.get();
        this.subNFromA(n, false);
        this.regAF.h.set(a);
    }
    /** Pushes the given data to the stack pointer's position, and moves it back by two */
    protected push(s: System, data: number) {
        this.regSP.dec();
        s.write(this.regSP.get(), high(data));
        this.regSP.dec();
        s.write(this.regSP.get(), low(data));
    }
    /** Pops a 16bit address from the stack pointer's position, and moves it forward by two */
    protected pop(s: System) {
        const low = s.read(this.regSP.get());
        this.regSP.inc();
        const high = s.read(this.regSP.get());
        this.regSP.inc();
        return combine(high, low);
    }
    /** Pushes the current PC to memory, and jump to the given address. */
    protected call(s: System, address: number) {
        const pc = this.regPC.get();
        this.push(s, pc);
        this.regPC.set(address);
    }
    /** Returns the current call (ie. consumes a pointer at SP and sets it to PC) */
    protected return(s: System) {
        this.regPC.set(this.pop(s));
    }
    /** Jumps to the given 16bit address */
    protected jump(n: number) {
        this.regPC.set(n);
    }
    /** Relative-jumps by the given 8-bit value */
    protected jumpr(n: number) {
        this.regPC.set(wrap16(this.regPC.get() + n));
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
    /** Applies rotateL to a subregister. Sets flags Z|0/0/0/Sr7 */
    protected rotateLSr(srName: SubRegisterName, useCarry: boolean, setZero: boolean) {
        const sr = this.sr(srName);
        sr.set(this.rotateL(sr.get(), useCarry, setZero));
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
    /** Applies rotateR to a subregister. Sets flags Z|0/0/0/Sr0 */
    protected rotateRSr(srName: SubRegisterName, useCarry: boolean, setZero: boolean) {
        const sr = this.sr(srName);
        sr.set(this.rotateR(sr.get(), useCarry, setZero));
    }
}

export default CPU;
