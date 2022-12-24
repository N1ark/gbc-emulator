import CPU from "./emulator/CPU";
import System from "./emulator/System";

const DummyInput = {
    read: () => ({
        a: false,
        b: false,
        select: false,
        start: false,
        down: false,
        up: false,
        left: false,
        right: false,
    }),
};

class DummySystem extends System {
    constructor(data: number[]) {
        super(MakeRom(data), DummyInput, {});
    }
}

const MakeRom = (data: number[]): Uint8Array => {
    const rom = new Uint8Array(0x200 + data.length + 10); // padding
    rom.fill(0);
    for (let i = 0; i < data.length; i++) {
        rom[0x100 + i] = data[i];
    }
    return rom;
};

const testOpSpeed = () => {
    const speeds = [
        1, 3, 2, 2, 1, 1, 2, 1, 5, 2, 2, 2, 1, 1, 2, 1, 0, 3, 2, 2, 1, 1, 2, 1, 3, 2, 2, 2, 1,
        1, 2, 1, 2, 3, 2, 2, 1, 1, 2, 1, 2, 2, 2, 2, 1, 1, 2, 1, 2, 3, 2, 2, 3, 3, 3, 1, 2, 2,
        2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2,
        1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 2, 2, 2,
        2, 2, 0, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1,
        1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1,
        2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 2, 3, 3, 4, 3, 4, 2, 4, 2, 4, 3,
        0, 3, 6, 2, 4, 2, 3, 3, 0, 3, 4, 2, 4, 2, 4, 3, 0, 3, 0, 2, 4, 3, 3, 2, 0, 0, 4, 2, 4,
        4, 1, 4, 0, 0, 0, 2, 4, 3, 3, 2, 1, 0, 4, 2, 4, 3, 2, 4, 1, 0, 0, 2, 4,
    ];
    for (let op = 0; op < 0xff; op++) {
        if (speeds[op] === 0) continue;
        const system = new DummySystem([op]);
        const cpu = new CPU();
        let steps = 0;
        do {
            cpu.step(system);
            steps++;
        } while (cpu["nextStep"] !== null);
        if (speeds[op] !== steps) {
            console.log(
                `Step mismatch for op ${op.toString(16)}: got ${steps}, expected ${speeds[op]}`
            );
        }
    }
};

const testHaltBug = () => {
    const system = new DummySystem([
        0x00, // 100: nop
        0xaf, // 101: xor a
        0xf3, // 102: di
        0x00, // 103: nop
        0x76, // 104: halt
        0x3c, // 105: inc a
        0x00, // 106: nop
        0x00, // 107: nop
        0x00, // 108: nop
        0xc3, // 109: jp $109
        0x09,
        0x01,
    ]);
    system["intEnable"].set(0b1);
    const cpu = new CPU();
    let limit = 100;
    while (limit--) {
        cpu.step(system);
        system.tick();
    }
    // At this point CPU is halted and waiting
    console.log(`State of IME = ${system["intMasterEnable"]} (should be disabled)`);
    // This should unhalt, and make halt bug of repeating
    system.requestInterrupt(0b1);

    limit = 100;
    while (limit--) {
        cpu.step(system);
        system.tick();
    }
    console.log(`Halt Bug: A = ${cpu["srA"].get()} (should be = 2)`);
    console.log(`PC is: ${cpu["regPC"].get().toString(16)}`);
};

const setupTests = () => {
    const testKeys = {
        testOpSpeed,
        testHaltBug,
    };

    Object.assign(window, testKeys);
};

export default setupTests;
