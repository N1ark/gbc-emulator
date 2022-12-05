import GameBoyColor from "./emulator/GameBoyColor";

/** The list of files to run for tests, per "test group" */
const testFiles = {
    blaarg: [
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
        "dmg_sound",
        "halt_bug",
        "instr_timing",
        "mem_timing",
        "oam_bug",
    ],
    mooneye: [
        // Instructions // Interrupts
        "daa",
        "ei_sequence",
        "halt_ime0_ei",
        "ie_push",
        "if_ie_registers",
        "rapid_di_ei",
        "reg_f",
        // PPU
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
        // Instruction Timings
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
        // Timer
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
        // // MBC1
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
        // OAM DMA
        "mem_oam",
        "oam_dma_restart",
        "oam_dma_start",
        "oam_dma_timing",
        "oam_dma_basic",
        "oam_dma_reg_read",
        "oam_dma_sources-GS",
    ],
};

/** The list of test categories, with a runnable that says the status of the test  */
const testConfig: Record<
    keyof typeof testFiles,
    (gbc: GameBoyColor, out: string) => null | "success" | "failure"
> = {
    blaarg: (gbc, serialOut) => {
        if (serialOut.toLowerCase().includes("pass")) return "success";
        if (serialOut.toLowerCase().includes("fail")) return "failure";
        return null;
    },
    mooneye: (gbc) => {
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
};

export { testFiles, testConfig };
