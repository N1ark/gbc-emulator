// @ts-ignore
import GameboyJS from "./emulator2";

import { FunctionalComponent } from "preact";
import { Ref, useCallback, useEffect, useRef, useState } from "preact/hooks";
import "./app.css";
import GameInput from "./emulator/GameInput";
import RomInput from "./RomInput";
import Screen from "./Screen";
import useKeys from "./useKeys";

import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameBoyColor from "./emulator/GameBoyColor";
import GameBoyOutput from "./emulator/GameBoyOutput";
import localforage from "localforage";

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
const CACHE_KEY = "rom";

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

    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const [serialOut, setSerialOut] = useState<String>("");

    const loadGame = useCallback(
        (rom: Uint8Array) => {
            if (gameboy) {
                gameboy.stop();
                setSerialOut("");
            }
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

            const gbc = new GameBoyColor(rom, gameIn, gbOut, debug);
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
                    fileCallback(rom);
                }, 10);
            }

            requestAnimationFrame(() => gbc.run());
        },
        [gameboy]
    );

    /**
     * Utility refresh: gets the caches ROM and plays it.
     */
    useEffect(() => {
        const listener = (e: KeyboardEvent) =>
            e.key === "r" &&
            localforage.getItem(CACHE_KEY, (err, value) => {
                if (!value) return;
                setLoadedGame(value as Uint8Array);
                loadGame(value as Uint8Array);
            });

        document.addEventListener("keydown", listener);
        return () => document.removeEventListener("keydown", listener);
    }, [loadGame, setLoadedGame]);

    /**
     * Cache the loaded ROM, and load it in.
     */
    const loadRom = useCallback(
        (rom: ArrayBuffer) => {
            const romArray = new Uint8Array(rom);
            // try caching the rom for reloads / refreshes
            localforage.setItem(
                CACHE_KEY,
                romArray,
                (err) => err && console.warn("Error caching ROM: ", err)
            );
            setLoadedGame(romArray);
            loadGame(romArray);
        },
        [loadGame, setLoadedGame]
    );

    /**
     * Hot load: if a ROM is cached, instantly loads it on startup.
     */
    useEffect(() => {
        localforage.getItem(CACHE_KEY, (err, value) => {
            if (!value) return;
            setLoadedGame(value as Uint8Array);
            loadGame(value as Uint8Array);
        });
    }, []);

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            <RomInput type="gb" onLoad={loadRom} />

            {gameboy && (
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
            )}
        </>
    );
};

export default App;
