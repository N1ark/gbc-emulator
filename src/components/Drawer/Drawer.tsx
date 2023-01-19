import { FunctionalComponent } from "preact";
import "./Drawer.css";
import DrawerSection from "./DrawerSection";
import ExpressionDrawer from "./ExpressionDrawer";
import SettingsDrawer from "./SettingsDrawer";
import TestDrawer from "./TestDrawer";

type DrawerProps = {
    loadRom: (rom: Uint8Array) => void;
};

const Drawer: FunctionalComponent<DrawerProps> = ({ loadRom }) => (
    <div id="drawer">
        <DrawerSection title="settings">
            <SettingsDrawer />
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
