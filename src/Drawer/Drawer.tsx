import { FunctionalComponent } from "preact";
import "./Drawer.css";
import DrawerSection from "./DrawerSection";
import ExpressionDrawer from "./ExpressionDrawer";
import { useEffect, useState } from "preact/hooks";

const Drawer: FunctionalComponent = () => {
    const [ticker, setTicker] = useState<number>(0);

    useEffect(() => {
        const intervalId = setInterval(() => setTicker((p) => p + 1), 100);
        return () => clearInterval(intervalId);
    }, [setTicker]);

    return (
        <div id="drawer">
            <DrawerSection title="watch expressions">
                <ExpressionDrawer updater={ticker} />
            </DrawerSection>
        </div>
    );
};

export default Drawer;
