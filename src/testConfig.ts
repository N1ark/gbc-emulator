import GameBoyColor from "@emulator/GameBoyColor";

type MiniTest = {
    file: string;
    consoleType: "DMG" | "CGB";
};

const mkTests: (consoleType: "DMG" | "CGB", ...names: string[]) => MiniTest[] = (
    consoleType,
    ...names
) =>
    names.map((n) => ({
        file: n,
        consoleType,
    }));

const dmgTests: (...names: string[]) => MiniTest[] = (...names) => mkTests("DMG", ...names);
const cgbTests: (...names: string[]) => MiniTest[] = (...names) => mkTests("CGB", ...names);

/** The list of files to run for tests, per "test group" */
const rawTestFiles = {
    blaarg: {
        cpu: dmgTests(
            "cpu-01-special",
            "cpu-02-interrupts",
            "cpu-03-op sp,hl",
            "cpu-04-op r,imm",
            "cpu-05-op rp",
            "cpu-06-ld r,r",
            "cpu-07-jr,jp,call,ret,rst",
            "cpu-08-misc instrs",
            "cpu-09-op r,r",
            "cpu-10-bit ops",
            "cpu-11-op a,(hl)",
            "instr_timing",
            "mem_timing"
        ),
        apu: dmgTests(
            "apu-01-registers",
            "apu-02-len ctr",
            "apu-03-trigger",
            "apu-04-sweep",
            "apu-05-sweep details",
            "apu-06-overflow on trigger",
            "apu-07-len sweep period sync",
            "apu-08-len ctr during power",
            "apu-09-wave read while on",
            "apu-10-wave trigger while on",
            "apu-11-regs after power",
            "apu-12-wave write while on"
        ),
        other: dmgTests("halt_bug", "oam_bug"),
    },
    mooneye: {
        itrAndCpu: dmgTests(
            "daa",
            "ei_sequence",
            "halt_ime0_ei",
            "ie_push",
            "if_ie_registers",
            "rapid_di_ei",
            "reg_f",
            "unused_hwio-GS"
        ),
        ppu: dmgTests(
            "ppu_hblank_ly_scx_timing-GS",
            "ppu_intr_1_2_timing-GS",
            "ppu_intr_2_0_timing",
            "ppu_intr_2_mode0_timing",
            "ppu_intr_2_mode0_timing_sprites",
            "ppu_intr_2_mode3_timing",
            "ppu_intr_2_oam_ok_timing",
            "ppu_lcdon_timing-GS",
            "ppu_lcdon_write_timing-GS",
            "ppu_stat_irq_blocking",
            "ppu_stat_lyc_onoff",
            "ppu_vblank_stat_intr-GS"
        ),
        cpuTiming: dmgTests(
            "add_sp_e_timing",
            "call_cc_timing",
            "call_cc_timing2",
            "call_timing",
            "call_timing2",
            "di_timing-GS",
            "div_timing",
            "ei_timing",
            "halt_ime0_nointr_timing",
            "halt_ime1_timing",
            "halt_ime1_timing2-GS",
            "intr_timing",
            "jp_cc_timing",
            "jp_timing",
            "ld_hl_sp_e_timing",
            "pop_timing",
            "push_timing",
            "ret_cc_timing",
            "reti_intr_timing",
            "reti_timing",
            "rst_timing"
        ),
        timer: dmgTests(
            "timer_div_write",
            "timer_rapid_toggle",
            "timer_tim00",
            "timer_tim00_div_trigger",
            "timer_tim01",
            "timer_tim01_div_trigger",
            "timer_tim10",
            "timer_tim10_div_trigger",
            "timer_tim11",
            "timer_tim11_div_trigger",
            "timer_tima_reload",
            "timer_tima_write_reloading",
            "timer_tma_write_reloading"
        ),
        mbc1: dmgTests(
            "mbc1_bits_bank1",
            "mbc1_bits_bank2",
            "mbc1_bits_mode",
            "mbc1_bits_ramg",
            "mbc1_ram_256kb",
            "mbc1_ram_64kb",
            "mbc1_rom_16Mb",
            "mbc1_rom_1Mb",
            "mbc1_rom_2Mb",
            "mbc1_rom_4Mb",
            "mbc1_rom_512kb",
            "mbc1_rom_8Mb"
        ),
        mbc2: dmgTests(
            "mbc2_bits_ramg",
            "mbc2_bits_romb",
            "mbc2_bits_unused",
            "mbc2_ram",
            "mbc2_rom_1Mb",
            "mbc2_rom_2Mb",
            "mbc2_rom_512kb"
        ),
        mbc5: dmgTests(
            "mbc5_rom_16Mb",
            "mbc5_rom_1Mb",
            "mbc5_rom_2Mb",
            "mbc5_rom_32Mb",
            "mbc5_rom_4Mb",
            "mbc5_rom_512kb",
            "mbc5_rom_64Mb",
            "mbc5_rom_8Mb"
        ),
        oam: dmgTests(
            "mem_oam",
            "oam_dma_restart",
            "oam_dma_start",
            "oam_dma_timing",
            "oam_dma_basic",
            "oam_dma_reg_read",
            "oam_dma_sources-GS"
        ),
    },
    acid: {
        acid: dmgTests("dmg-acid2"),
    },
    samesuite: {
        dma: cgbTests("gbc_dma_cont", "gdma_addr_mask", "hdma_lcd_off", "hdma_mode0"),
    },
};

type TestType = keyof typeof rawTestFiles;
type SubTestType = { [k in TestType]: keyof typeof rawTestFiles[k] }[TestType];
type TestChecker = (
    gbc: GameBoyColor,
    out: string,
    vid: Uint32Array,
    testName: string
) => Promise<null | "success" | "failure">;

export type Test = MiniTest & {
    testType: TestType;
    subTestType: SubTestType;
    check: TestChecker;
};

const loadImageData = async (fileName: string): Promise<Uint32Array> => {
    let promiseResolve: (value: Uint32Array) => void;
    let endPromise = new Promise<Uint32Array>((r) => (promiseResolve = r));

    let img = new Image();
    img.onload = function () {
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, 160, 144);
        const imageDataAsUint32 = new Uint32Array(imageData.data.buffer);
        promiseResolve(imageDataAsUint32);
    };
    img.src = `/tests/${fileName}.png`;
    return endPromise;
};

const compareImages = (imgA: Uint32Array, imgB: Uint32Array) => {
    if (imgA.length !== imgB.length) return "failure";
    for (let i = 0; i < imgA.length; i++) {
        if (imgA[i] !== imgB[i]) return "failure";
    }
    return "success";
};

/** The list of test categories, with a runnable that says the status of the test  */
const testConfig: Record<TestType, TestChecker> = {
    blaarg: async (gbc, serialOut, vid, testName) => {
        if (serialOut.toLowerCase().includes("pass")) return "success";
        if (serialOut.toLowerCase().includes("fail")) return "failure";

        if (testName.startsWith("apu-")) {
            if (gbc["system"].inspect(0xa001, 3) === "de b0 61") {
                // APU tests write to a000, with status
                const status = gbc["system"].read(0xa000);
                if (status === 0x80) return null;
                return status === 0x00 ? "success" : "failure";
            }
        }

        if (testName === "halt_bug" && gbc["cpu"].getStepCounts() >= 700_000) {
            const expected = await loadImageData("blaarg/reference-halt_bug");
            return compareImages(expected, vid);
        }
        if (testName === "oam_bug" && gbc["cpu"].getStepCounts() >= 6_030_000) {
            const expected = await loadImageData("blaarg/reference-oam_bug");
            return compareImages(expected, vid);
        }
        return null;
    },
    mooneye: async (gbc) => {
        if (
            gbc["cpu"]["srB"].get() === 3 &&
            gbc["cpu"]["srC"].get() === 5 &&
            gbc["cpu"]["srD"].get() === 8 &&
            gbc["cpu"]["srE"].get() === 13 &&
            gbc["cpu"]["srH"].get() === 21 &&
            gbc["cpu"]["srL"].get() === 34
        )
            return "success";
        if (
            gbc["cpu"]["srB"].get() === 0x42 &&
            gbc["cpu"]["srC"].get() === 0x42 &&
            gbc["cpu"]["srD"].get() === 0x42 &&
            gbc["cpu"]["srE"].get() === 0x42 &&
            gbc["cpu"]["srH"].get() === 0x42 &&
            gbc["cpu"]["srL"].get() === 0x42
        )
            return "failure";
        return null;
    },
    acid: async (gbc, _, vid) => {
        if (gbc["cpu"]["stepCounter"] >= 85000) {
            let imageData = await loadImageData("acid/reference-dmg");
            return compareImages(imageData, vid);
        }
        return null;
    },
    samesuite: async (gbc, txt) => {
        if (txt === String.fromCharCode(3, 5, 8, 13, 21, 34)) {
            return "success";
        }
        if (txt === String.fromCharCode(66, 66, 66, 66, 66, 66)) {
            return "failure";
        }
        return null;
    },
};

const tests: Test[] = (
    Object.entries(rawTestFiles) as [TestType, Record<SubTestType, MiniTest[]>][]
).flatMap(([testType, subTests]) =>
    (Object.entries(subTests) as [SubTestType, MiniTest[]][]).flatMap(
        ([subTestType, miniTests]) =>
            miniTests.map((test) => ({
                ...test,
                testType,
                subTestType,
                check: testConfig[testType],
            }))
    )
);

export default tests;
