import GameBoyColor from "./emulator/GameBoyColor";

/** The list of files to run for tests, per "test group" */
const testFiles = {
    mooneye: [
        "add_sp_e_timing",
        "halt_ime0_nointr_timing",
        "mbc1_bits_ramg",
        "oam_dma_start",
        "call_cc_timing",
        "halt_ime1_timing",
        "mbc1_ram_256kb",
        "oam_dma_timing",
        "call_cc_timing2",
        "halt_ime1_timing2-GS",
        "mbc1_ram_64kb",
        "pop_timing",
        "call_timing",
        "if_ie_registers",
        "mbc1_rom_16Mb",
        "push_timing",
        "call_timing2",
        "intr_timing",
        "mbc1_rom_1Mb",
        "rapid_di_ei",
        "daa",
        "jp_cc_timing",
        "mbc1_rom_2Mb",
        "reg_f",
        "di_timing-GS",
        "jp_timing",
        "mbc1_rom_4Mb",
        "ret_cc_timing",
        "div_timing",
        "ld_hl_sp_e_timing",
        "mbc1_rom_512kb",
        "reti_intr_timing",
        "ei_sequence",
        "mbc1_bits_bank1",
        "mbc1_rom_8Mb",
        "reti_timing",
        "ei_timing",
        "mbc1_bits_bank2",
        "mem_oam",
        "rst_timing",
        "halt_ime0_ei",
        "mbc1_bits_mode",
        "oam_dma_restart",
    ].sort(),
};

/** The list of test categories, with a runnable that says the status of the test  */
const testConfig: Record<
    keyof typeof testFiles,
    (gbc: GameBoyColor) => null | "success" | "failure"
> = {
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
