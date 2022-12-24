import GameBoyColor from "./emulator/GameBoyColor";

/** The list of files to run for tests, per "test group" */
const testFiles = {
    blaarg: {
        cpu: [
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
            "mem_timing",
        ],
        other: ["dmg_sound", "halt_bug", "oam_bug"],
    },
    mooneye: {
        itrAndCpu: [
            "daa",
            "ei_sequence",
            "halt_ime0_ei",
            "ie_push",
            "if_ie_registers",
            "rapid_di_ei",
            "reg_f",
        ],
        ppu: [
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
            "ppu_vblank_stat_intr-GS",
        ],
        cpuTiming: [
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
            "rst_timing",
        ],
        timer: [
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
            "timer_tma_write_reloading",
        ],
        mbc1: [
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
            "mbc1_rom_8Mb",
        ],
        mbc2: [
            "mbc2_bits_ramg",
            "mbc2_bits_romb",
            "mbc2_bits_unused",
            "mbc2_ram",
            "mbc2_rom_1Mb",
            "mbc2_rom_2Mb",
            "mbc2_rom_512kb",
        ],
        mbc5: [
            "mbc5_rom_16Mb",
            "mbc5_rom_1Mb",
            "mbc5_rom_2Mb",
            "mbc5_rom_32Mb",
            "mbc5_rom_4Mb",
            "mbc5_rom_512kb",
            "mbc5_rom_64Mb",
            "mbc5_rom_8Mb",
        ],
        oam: [
            "mem_oam",
            "oam_dma_restart",
            "oam_dma_start",
            "oam_dma_timing",
            "oam_dma_basic",
            "oam_dma_reg_read",
            "oam_dma_sources-GS",
        ],
    },
    acid: {
        acid: ["dmg-acid2"],
    },
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
const testConfig: Record<
    keyof typeof testFiles,
    (
        gbc: GameBoyColor,
        out: string,
        vid: Uint32Array,
        testName: string
    ) => Promise<null | "success" | "failure">
> = {
    blaarg: async (gbc, serialOut, vid, testName) => {
        if (serialOut.toLowerCase().includes("pass")) return "success";
        if (serialOut.toLowerCase().includes("fail")) return "failure";
        if (testName === "halt_bug" && gbc["cpu"].getStepCounts() >= 700_000) {
            const expected = await loadImageData("blaarg/reference-halt_bug");
            return compareImages(expected, vid);
        }
        if (testName === "oam_bug" && gbc["cpu"].getStepCounts() >= 6_030_000) {
            const expected = await loadImageData("blaarg/reference-oam_bug");
            return compareImages(expected, vid);
        }
        if (testName === "dmg_sound" && gbc["cpu"].getStepCounts() > 2_900_000) {
            const expected = await loadImageData("blaarg/reference-dmg_sound");
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
};

export { testFiles, testConfig };
