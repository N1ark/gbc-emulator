import { Circle, CircleDot, Grid, Square, Target } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
import Grid2x from "../Grid2x";
import { Identity, ImageFilter, Scale2x, Scale4x } from "../ImageFilter";

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
                <button
                    title="identity"
                    className={`icon-button ${currentFilter === Identity ? "toggled" : ""}`}
                    onClick={() => setFilter(Identity)}
                >
                    <Square />
                </button>
                <button
                    title="scale2x"
                    className={`icon-button ${currentFilter === Scale2x ? "toggled" : ""}`}
                    onClick={() => setFilter(Scale2x)}
                >
                    <Grid2x />
                </button>
                <button
                    title="scale4x"
                    className={`icon-button ${currentFilter === Scale4x ? "toggled" : ""}`}
                    onClick={() => setFilter(Scale4x)}
                >
                    <Grid />
                </button>
            </div>
        </div>
    );
};

export default GraphicsDrawer;
