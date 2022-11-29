import { Ref, useCallback, useEffect, useRef, useState } from "preact/hooks";
import "./app.css";
import { createRef, FunctionalComponent } from "preact";
import RomInput from "./RomInput";
import Screen from "./Screen";
import GameBoyColor from "./emulator/GameBoyColor";
import GameBoyOutput from "./emulator/GameBoyOutput";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameInput from "./emulator/GameInput";
import useKeys from "./useKeys";

// @ts-ignore
import GameboyJS from "./emulator2";

const displayData = (
    data: Uint32Array,
    ref: Ref<HTMLCanvasElement>,
    width: number = SCREEN_WIDTH,
    height: number = SCREEN_HEIGHT
) => {
    const canvas = ref.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dataAsUint8 = new Uint8ClampedArray(data.buffer);
    const imageData = new ImageData(dataAsUint8, width, height);
    context.putImageData(imageData, 0, 0);
};

const emulator2Enabled = false;
const debugEnabled = false;

const App: FunctionalComponent = () => {
    const pressedKeys = useKeys([
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "g",
        "b",
        "h",
        "n",
    ]);

    const emulator1Ref = useRef<HTMLCanvasElement>(null);
    const emulator2Ref = useRef<HTMLCanvasElement>(null);
    const bgDebugger = useRef<HTMLCanvasElement>(null);
    const tilesetDebugger = useRef<HTMLCanvasElement>(null);

    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const [serialOut, setSerialOut] = useState<String>("");

    useEffect(() => {
        if (gameboy !== undefined) return;

        const listener = (e: KeyboardEvent) =>
            e.key === "z" &&
            fetch("/tetris.gb")
                .then((r) => r.blob())
                .then((b) => b.arrayBuffer())
                .then((txt) => loadRom(txt));

        document.addEventListener("keydown", listener);
        return () => document.removeEventListener("keydown", listener);
    }, [gameboy]);
    const loadRom = useCallback((rom: ArrayBuffer) => {
        const gameIn: GameInput = {
            read: () => ({
                up: !pressedKeys.includes("arrowup"),
                down: !pressedKeys.includes("arrowdown"),
                left: !pressedKeys.includes("arrowleft"),
                right: !pressedKeys.includes("arrowright"),
                a: !pressedKeys.includes("g"),
                b: !pressedKeys.includes("b"),
                start: !pressedKeys.includes("h"),
                select: !pressedKeys.includes("n"),
            }),
        };

        const debug = debugEnabled
            ? () => ({
                  canStep: pressedKeys.includes(" "),
                  skipDebug: pressedKeys.includes("escape"),
              })
            : undefined;

        const gbOut: GameBoyOutput = {
            receive: (d) => displayData(d, emulator1Ref),
            serialOut: (d) => setSerialOut((prev) => prev + String.fromCharCode(d)),
        };
        if (debugEnabled) {
            gbOut.debugBackground = (d) => displayData(d, bgDebugger, 256, 256);
            gbOut.debugTileset = (d) => displayData(d, tilesetDebugger, 128, 192);
        }
        const romArray = new Uint8Array(rom);
        const gbc = new GameBoyColor(romArray, gameIn, gbOut, debug);
        setGameboy(gbc);

        if (emulator2Enabled) {
            setTimeout(() => {
                // Create Emulator 2 (working)
                let fileCallback = (d: Uint8Array) => {};
                new GameboyJS.Gameboy(emulator2Ref.current, {
                    romReaders: [
                        {
                            setCallback: (c: (d: Uint8Array) => void) => {
                                fileCallback = c;
                            },
                        },
                    ],
                });
                fileCallback(romArray);
            }, 10);
        }

        requestAnimationFrame(() => gbc.run());
    }, []);

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            {gameboy ? (
                <div id="emu-stack">
                    <div id="emu-screens">
                        <Screen canvasRef={emulator1Ref} />
                        {emulator2Enabled && <Screen canvasRef={emulator2Ref} />}
                        {debugEnabled && (
                            <>
                                <Screen width={256} height={256} canvasRef={bgDebugger} />
                                <Screen width={128} height={192} canvasRef={tilesetDebugger} />
                            </>
                        )}
                    </div>
                    {serialOut.length > 0 && (
                        <code
                            className={
                                serialOut.toLowerCase().includes("passed")
                                    ? "passed"
                                    : serialOut.toLowerCase().includes("failed")
                                    ? "failed"
                                    : undefined
                            }
                        >
                            {serialOut}
                        </code>
                    )}
                </div>
            ) : (
                <RomInput type="gb" onLoad={loadRom} />
            )}
        </>
    );
};

export default App;
