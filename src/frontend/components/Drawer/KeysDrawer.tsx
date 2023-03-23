import { FunctionalComponent } from "preact";

import KeybindingInput from "@components/KeybindingInput";
import { useConfig } from "@helpers/ConfigContext";

const KeysDrawer: FunctionalComponent = () => {
    const [
        {
            controlArrowUp,
            controlArrowDown,
            controlArrowLeft,
            controlArrowRight,
            controlA,
            controlB,
            controlStart,
            controlSelect,
        },
        setConfig,
    ] = useConfig();
    return (
        <div>
            <div className="drawer-section-description">
                Click to edit, press enter to save, press escape to cancel.
            </div>
            <div className="keys-drawer">
                <div>Up</div>
                <KeybindingInput
                    value={controlArrowUp}
                    onChange={(v) => setConfig({ controlArrowUp: v })}
                />
                <div>A</div>
                <KeybindingInput
                    value={controlA}
                    onChange={(v) => setConfig({ controlA: v })}
                />
                <div>Down</div>
                <KeybindingInput
                    value={controlArrowDown}
                    onChange={(v) => setConfig({ controlArrowDown: v })}
                />
                <div>B</div>
                <KeybindingInput
                    value={controlB}
                    onChange={(v) => setConfig({ controlB: v })}
                />
                <div>Left</div>
                <KeybindingInput
                    value={controlArrowLeft}
                    onChange={(v) => setConfig({ controlArrowLeft: v })}
                />
                <div>Start</div>
                <KeybindingInput
                    value={controlStart}
                    onChange={(v) => setConfig({ controlStart: v })}
                />
                <div>Right</div>
                <KeybindingInput
                    value={controlArrowRight}
                    onChange={(v) => setConfig({ controlArrowRight: v })}
                />

                <div>Select</div>
                <KeybindingInput
                    value={controlSelect}
                    onChange={(v) => setConfig({ controlSelect: v })}
                />
            </div>
        </div>
    );
};

export default KeysDrawer;
