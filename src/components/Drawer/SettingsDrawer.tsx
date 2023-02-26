import { useConfig } from "@/helpers/ConfigContext";
import { Identity, Scale2x, Scale4x } from "@/helpers/ImageFilter";
import IconButton from "@components/IconButton";
import {
    Grid,
    ImageOff,
    Image,
    Square,
    Dice1,
    Dice2,
    Dice4,
    FileDigit,
    FileX2,
    Gamepad,
    Palette,
    MessageSquare,
    LineChart,
    Bug,
    Circle,
    Waves,
    Flame,
    Flower,
} from "lucide-preact";
import { FunctionalComponent } from "preact";
import Grid2x from "./Grid2x";

const availableFilters = [
    {
        name: "identity",
        filter: Identity,
        icon: Square,
    },
    {
        name: "scale2x",
        filter: Scale2x,
        icon: Grid2x,
    },
    {
        name: "scale4x",
        filter: Scale4x,
        icon: Grid,
    },
];

type DMGPalette = Partial<Record<number, number>> | undefined;

const palette = (white: number, lightGray: number, darkGray: number, black: number) => ({
    0xffffffff: white | 0xff000000,
    0xffaaaaaa: lightGray | 0xff000000,
    0xff555555: darkGray | 0xff000000,
    0xff000000: black | 0xff000000,
});

const isPaletteEquivalent = (palette1: DMGPalette, palette2: DMGPalette) => {
    if (!palette1 && !palette2) return true; // both undefined
    if (!palette1 || !palette2) return false; // only one undefined
    if (Object.keys(palette1).length !== Object.keys(palette2).length) return false;
    for (const key of Object.keys(palette1)) {
        // @ts-ignore
        if (palette1[key] !== palette2[key]) return false;
    }
    return true;
};

const availablePalettes = [
    {
        name: "monochrome",
        values: undefined, // no transform
        icon: Circle,
    },
    {
        name: "classic",
        values: palette(0x95ddca, 0x6aa48b, 0x3d6042, 0x11180c),
        icon: Gamepad,
    },
    {
        name: "ocean",
        values: palette(0xace2b9, 0x8a9965, 0x67582c, 0x35250c),
        icon: Waves,
    },
    {
        name: "magma",
        values: palette(0x9ed4e5, 0x645ab0, 0x451f7b, 0x3c0112),
        icon: Flame,
    },
    {
        name: "sakura",
        values: palette(0xe1dee9, 0x9377cd, 0x623cb5, 0x2b1449),
        icon: Flower,
    },
];

const SettingsDrawer: FunctionalComponent = () => {
    const [
        {
            filter: currentFilter,
            frameBlending,
            scale,
            bootRom,
            console,
            gbPalette,
            volume,
            showStats,
            showDebugScreens,
        },
        setConfig,
    ] = useConfig();
    return (
        <>
            <div className="drawer-section-title">
                <div>Console:</div>
                <IconButton
                    id="dmg-mode"
                    title="Gameboy (DMG)"
                    toggled={console === "dmg"}
                    Icon={Gamepad}
                    onClick={() => setConfig({ console: "dmg" })}
                />
                <IconButton
                    id="cgb-mode"
                    title="Gameboy Color (CGB)"
                    toggled={console === "cgb"}
                    Icon={Palette}
                    onClick={() => setConfig({ console: "cgb" })}
                />
            </div>

            <div className="drawer-section-title">
                <div>Filter:</div>
                {availableFilters.map(({ name, filter, icon }) => (
                    <IconButton
                        title={name}
                        toggled={filter === currentFilter}
                        Icon={icon}
                        onClick={() => setConfig({ filter })}
                    />
                ))}
            </div>

            <div className="drawer-section-title">
                <div>Scale:</div>
                <IconButton
                    title="Scale x1"
                    toggled={scale === 0}
                    Icon={Dice1}
                    onClick={() => setConfig({ scale: 0 })}
                />
                <IconButton
                    title="Scale x2"
                    toggled={scale === 1}
                    Icon={Dice2}
                    onClick={() => setConfig({ scale: 1 })}
                />
                <IconButton
                    title="Scale x4"
                    toggled={scale === 2}
                    Icon={Dice4}
                    onClick={() => setConfig({ scale: 2 })}
                />
            </div>

            <div className="drawer-section-title">
                <div>Volume:</div>

                <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.02"
                    value={volume}
                    onChange={(e) => setConfig({ volume: +e.currentTarget.value })}
                />
            </div>

            <div className="drawer-section-title">
                <div>GB Palette:</div>

                {availablePalettes.map(({ name, icon, values }) => (
                    <IconButton
                        title={name}
                        Icon={icon}
                        onClick={() => setConfig({ gbPalette: values })}
                        toggled={isPaletteEquivalent(gbPalette, values)}
                        showTooltip
                    />
                ))}
            </div>

            <div className="drawer-section-title">
                <div>Other:</div>
                <IconButton
                    title="Boot ROM"
                    Icon={bootRom === "real" ? FileDigit : FileX2}
                    onClick={() => setConfig({ bootRom: bootRom === "none" ? "real" : "none" })}
                    toggled={bootRom === "real"}
                    showTooltip
                />

                <IconButton
                    title="Toggle blending"
                    Icon={frameBlending ? Image : ImageOff}
                    onClick={() => setConfig({ frameBlending: !frameBlending })}
                    toggled={frameBlending}
                    showTooltip
                />

                <IconButton
                    title="Show Stats"
                    Icon={LineChart}
                    onClick={() => setConfig({ showStats: !showStats })}
                    toggled={showStats}
                    showTooltip
                />

                <IconButton
                    title="Debug"
                    Icon={Bug}
                    onClick={() => setConfig({ showDebugScreens: !showDebugScreens })}
                    toggled={showDebugScreens}
                    showTooltip
                />
            </div>
        </>
    );
};

export default SettingsDrawer;
