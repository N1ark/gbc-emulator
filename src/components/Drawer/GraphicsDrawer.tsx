import { useConfig } from "@/helpers/ConfigContext";
import { Identity, ImageFilter, Scale2x, Scale4x } from "@/helpers/ImageFilter";
import IconButton from "@components/IconButton";
import { Grid, Square } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
import Grid2x from "./Grid2x";

const localStorageKey = "graphics-drawer-filter";

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

const filterToString = (f: ImageFilter) =>
    availableFilters.find((g) => g.filter === f)?.name ?? "identity";

const filterFromString = (f: string) =>
    availableFilters.find((g) => g.name === f)?.filter ?? Identity;

const GraphicsDrawer: FunctionalComponent = () => {
    const [{ filter: currentFilter }, setConfig] = useConfig();

    useEffect(() => {
        const savedFilter = localStorage.getItem(localStorageKey);
        if (savedFilter) {
            const filter = filterFromString(savedFilter);
            setConfig({ filter });
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(localStorageKey, filterToString(currentFilter));
    }, [currentFilter]);

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
        </div>
    );
};

export default GraphicsDrawer;
