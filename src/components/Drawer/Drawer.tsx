import { FunctionalComponent } from "preact";
import { Resizable } from "../Resizable";
import "./Drawer.css";
import DrawerSection from "./DrawerSection";
import ExpressionDrawer from "./ExpressionDrawer";
import MemoryDrawer from "./MemoryDrawer";
import SettingsDrawer from "./SettingsDrawer";
import TestDrawer from "./TestDrawer";

type DrawerProps = {
    loadRom: (rom: Uint8Array) => void;
};

const Drawer: FunctionalComponent<DrawerProps> = ({ loadRom }) => (
    <Resizable initalWidth={240} id="drawer">
        <DrawerSection title="settings">
            <SettingsDrawer />
        </DrawerSection>
        <DrawerSection title="watch expressions">
            <ExpressionDrawer />
        </DrawerSection>
        <DrawerSection title="test roms">
            <TestDrawer loadRom={loadRom} />
        </DrawerSection>
        <DrawerSection title="memory">
            <MemoryDrawer />
        </DrawerSection>
    </Resizable>
);

export default Drawer;
