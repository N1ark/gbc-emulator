import { useConfig } from "@/helpers/ConfigContext";
import { Identity, ImageFilter, Scale2x, Scale4x } from "@/helpers/ImageFilter";
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

const SettingsDrawer: FunctionalComponent = () => {
    const [
        {
            filter: currentFilter,
            frameBlending,
            scale,
            bootRom,
            console,
            volume,
            showSerialOutput,
            showStats,
            showDebugScreens,
        },
        setConfig,
    ] = useConfig();

    return (
        <div>
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
                    title="Show Serial Output"
                    Icon={MessageSquare}
                    onClick={() => setConfig({ showSerialOutput: !showSerialOutput })}
                    toggled={showSerialOutput}
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
        </div>
    );
};

export default SettingsDrawer;
