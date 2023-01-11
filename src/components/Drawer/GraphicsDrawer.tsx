import { Identity, ImageFilter, Scale2x, Scale4x } from "@/helpers/ImageFilter";
import IconButton from "@components/IconButton";
import { Grid, Square } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
import Grid2x from "./Grid2x";

type GraphicsDrawerProps = {
    currentFilter: ImageFilter;
    setFilter: (f: ImageFilter) => void;
};

const localStorageKey = "graphics-drawer-filter";

const GraphicsDrawer: FunctionalComponent<GraphicsDrawerProps> = ({
    currentFilter,
    setFilter,
}) => {
    useEffect(() => {
        const savedFilter = localStorage.getItem(localStorageKey);
        if (savedFilter) {
            setFilter(
                {
                    identity: Identity,
                    scale2x: Scale2x,
                    scale4x: Scale4x,
                }[savedFilter] ?? Identity
            );
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(
            localStorageKey,
            currentFilter === Identity
                ? "identity"
                : currentFilter === Scale4x
                ? "scale4x"
                : currentFilter === Scale2x
                ? "scale2x"
                : ""
        );
    }, [currentFilter]);

    return (
        <div>
            <div className="drawer-section-title">
                <div>Filter:</div>
                <IconButton
                    title="identity"
                    toggled={currentFilter === Identity}
                    Icon={Square}
                    onClick={() => setFilter(Identity)}
                />
                <IconButton
                    title="scale2x"
                    toggled={currentFilter === Scale2x}
                    Icon={Grid2x}
                    onClick={() => setFilter(Scale2x)}
                />
                <IconButton
                    title="scale4x"
                    toggled={currentFilter === Scale4x}
                    Icon={Grid}
                    onClick={() => setFilter(Scale4x)}
                />
            </div>
        </div>
    );
};

export default GraphicsDrawer;
