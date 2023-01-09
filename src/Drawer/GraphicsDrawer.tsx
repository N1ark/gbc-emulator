import { Circle, CircleDot, Target } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { Identity, ImageFilter, Scale2x, Scale4x } from "../ImageFilter";

type GraphicsDrawerProps = {
    currentFilter: ImageFilter;
    setFilter: (f: ImageFilter) => void;
};

const GraphicsDrawer: FunctionalComponent<GraphicsDrawerProps> = ({
    currentFilter,
    setFilter,
}) => (
    <div>
        <div className="drawer-section-title">
            <div>Filter:</div>
            <button
                title="identity"
                className={`icon-button ${currentFilter === Identity ? "toggled" : ""}`}
                onClick={() => setFilter(Identity)}
            >
                <Circle />
            </button>
            <button
                title="scale2x"
                className={`icon-button ${currentFilter === Scale2x ? "toggled" : ""}`}
                onClick={() => setFilter(Scale2x)}
            >
                <CircleDot />
            </button>
            <button
                title="scale4x"
                className={`icon-button ${currentFilter === Scale4x ? "toggled" : ""}`}
                onClick={() => setFilter(Scale4x)}
            >
                <Target />
            </button>
        </div>
    </div>
);

export default GraphicsDrawer;
