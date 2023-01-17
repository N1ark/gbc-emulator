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
} from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
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

const GraphicsDrawer: FunctionalComponent = () => {
    const [{ filter: currentFilter, frameBlending, scale, bootRom }, setConfig] = useConfig();

    return (
        <div>
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
                <div>Frame Blending:</div>
                <IconButton
                    title="Toggle blending"
                    Icon={frameBlending ? Image : ImageOff}
                    onClick={() => setConfig({ frameBlending: !frameBlending })}
                />
            </div>

            <div className="drawer-section-title">
                <div>Boot Rom:</div>
                <IconButton
                    title="Boot ROM"
                    Icon={bootRom === "real" ? FileDigit : FileX2}
                    onClick={() => setConfig({ bootRom: bootRom === "none" ? "real" : "none" })}
                />
            </div>
        </div>
    );
};

export default GraphicsDrawer;
