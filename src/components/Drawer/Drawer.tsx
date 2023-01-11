import { ImageFilter } from "@/helpers/ImageFilter";
import { FunctionalComponent } from "preact";
import "./Drawer.css";
import DrawerSection from "./DrawerSection";
import ExpressionDrawer from "./ExpressionDrawer";
import GraphicsDrawer from "./GraphicsDrawer";
import TestDrawer from "./TestDrawer";

type DrawerProps = {
    loadRom: (rom: Uint8Array) => void;
    currentFilter: ImageFilter;
    setFilter: (filter: ImageFilter) => void;
};

const Drawer: FunctionalComponent<DrawerProps> = ({ loadRom, currentFilter, setFilter }) => (
    <div id="drawer">
        <DrawerSection title="graphics">
            <GraphicsDrawer currentFilter={currentFilter} setFilter={setFilter} />
        </DrawerSection>
        <DrawerSection title="watch expressions">
            <ExpressionDrawer />
        </DrawerSection>
        <DrawerSection title="test roms">
            <TestDrawer loadRom={loadRom} />
        </DrawerSection>
    </div>
);

export default Drawer;
