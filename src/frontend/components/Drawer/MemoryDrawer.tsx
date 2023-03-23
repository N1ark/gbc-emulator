import { useSignal } from "@preact/signals";
import { FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";

import GameBoyColor from "@emulator/GameBoyColor";

const refreshMemory = (offset: number) => {
    // @ts-ignore
    const gbc: GameBoyColor = window.gbc;
    if (!gbc) return "Something went wrong";

    let memory = "";
    for (let address = offset; address < 0x10000; address += 16) {
        memory += address.toString(16).padStart(4, "0") + ": ";
        for (let i = 0; i < 16; i++) {
            memory +=
                gbc["system"]
                    .read(address + i)
                    .toString(16)
                    .padStart(2, "0") + "\u2009"; // thin space character
        }
        memory += "\n";
    }
    return memory;
};

const MEMORY_DRAWER_LOCAL_STORAGE_KEY = "memory-drawer-offset";

const MemoryDrawer: FunctionalComponent = () => {
    const memory = useSignal<string>("");
    const offset = useSignal<number>(0);

    useEffect(() => {
        const value = localStorage.getItem(MEMORY_DRAWER_LOCAL_STORAGE_KEY);
        if (value) offset.value = +value;
        memory.value = refreshMemory(offset.value);
    }, []);

    useEffect(() => {
        const callbackId = setInterval(() => {
            memory.value = refreshMemory(offset.value);
        }, 500);
        return () => clearInterval(callbackId);
    }, [offset]);

    return (
        <div>
            <div className="drawer-section-title">
                <div>Offset:</div>
                <input
                    type="text"
                    value={offset.value.toString(16).padStart(4, "0")}
                    onChange={(e) => {
                        offset.value = Number(`0x${e.currentTarget.value}`);
                        localStorage.setItem(
                            MEMORY_DRAWER_LOCAL_STORAGE_KEY,
                            offset.value.toString()
                        );
                    }}
                />
            </div>
            <div className="memory-output">{memory}</div>
        </div>
    );
};

export default MemoryDrawer;
