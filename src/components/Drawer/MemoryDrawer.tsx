import GameBoyColor from "@/emulator/GameBoyColor";
import IconButton from "@components/IconButton";
import { useSignal } from "@preact/signals";
import { RefreshCw } from "lucide-preact";
import { FunctionalComponent } from "preact";

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

const MemoryDrawer: FunctionalComponent = () => {
    const memory = useSignal<string>("");
    const offset = useSignal<number>(0);

    return (
        <div>
            <div className="drawer-section-title">
                <div>Refresh:</div>
                <IconButton
                    title="Refresh"
                    Icon={RefreshCw}
                    onClick={() => (memory.value = refreshMemory(offset.value))}
                />
            </div>
            <div className="drawer-section-title">
                <div>Offset:</div>
                <input
                    type="text"
                    value={offset.value.toString(16).padStart(4, "0")}
                    onChange={(e) => (offset.value = Number(`0x${e.currentTarget.value}`))}
                />
            </div>
            <div className="memory-output">{memory}</div>
        </div>
    );
};

export default MemoryDrawer;