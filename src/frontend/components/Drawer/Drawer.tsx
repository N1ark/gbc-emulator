import { FunctionalComponent } from "preact";

import { Resizable } from "@components/Resizable";

import DrawerSection from "./DrawerSection";
import ExpressionDrawer from "./ExpressionDrawer";
import KeysDrawer from "./KeysDrawer";
import MemoryDrawer from "./MemoryDrawer";
import SettingsDrawer from "./SettingsDrawer";
import TestDrawer from "./TestDrawer";

import "./Drawer.css";

type DrawerProps = {
    loadRom: (rom: Uint8Array) => void;
};

const Drawer: FunctionalComponent<DrawerProps> = ({ loadRom }) => (
    <Resizable initalWidth={300} id="drawer">
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
        <DrawerSection title="keybindings">
            <KeysDrawer />
        </DrawerSection>
    </Resizable>
);

export default Drawer;
