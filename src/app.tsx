// @ts-ignore
import GameboyJS from "./emulator2";

import { FunctionalComponent } from "preact";
import { Ref, useCallback, useEffect, useRef, useState } from "preact/hooks";
import { Play, Pause, Redo, Bug, FlipHorizontal } from "lucide-preact";

import "./app.css";
import GameInput from "./emulator/GameInput";
import RomInput from "./RomInput";
import Screen from "./Screen";
import useKeys from "./useKeys";

import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameBoyColor from "./emulator/GameBoyColor";
import GameBoyOutput from "./emulator/GameBoyOutput";
import localforage from "localforage";
import CPU from "./emulator/CPU";
import System from "./emulator/System";

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

    const [emulator2Enabled, setEmulator2Enabled] = useState<boolean>(false);
    const [debugEnabled, setDebugEnabled] = useState<boolean>(false);
    const emulatorRunning = useRef<boolean>(true);
    const [emulatorRunningState, setEmulatorRunningState] = useState<boolean>(true);
    const canStep = useRef<boolean>(true);

    const emulator1Ref = useRef<HTMLCanvasElement>(null);
    const emulator2Ref = useRef<HTMLCanvasElement>(null);
    const bgDebugger = useRef<HTMLCanvasElement>(null);
    const tilesetDebugger = useRef<HTMLCanvasElement>(null);

    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const [emulator2, setEmulator2] = useState<any>();
    const [serialOut, setSerialOut] = useState<string>("");

    const [cyclesPerSec, setCyclesPerSec] = useState<number>(0);
    const [stepCount, setStepCount] = useState<number>(0);
    const [millisPerFrame, setMillisPerFrame] = useState<number>(0);

    useEffect(() => {
        if (emulator2 && !emulator2Enabled) {
            emulator2.error("stop");
        }
    }, [emulator2Enabled, emulator2]);

    const loadGame = useCallback(
        (rom: Uint8Array) => {
            if (gameboy) {
                gameboy.stop();
                setSerialOut("");
            }
            const gameIn: GameInput = {
                read: () => ({
                    up: pressedKeys.includes("arrowup"),
                    down: pressedKeys.includes("arrowdown"),
                    left: pressedKeys.includes("arrowleft"),
                    right: pressedKeys.includes("arrowright"),
                    a: pressedKeys.includes("g"),
                    b: pressedKeys.includes("b"),
                    start: pressedKeys.includes("h"),
                    select: pressedKeys.includes("n"),
                }),
            };

            const debug = () => {
                const step = canStep.current;
                if (step) {
                    canStep.current = false;
                }
                return {
                    canStep: step,
                    skipDebug: emulatorRunning.current,
                };
            };

            const gbOut: GameBoyOutput = {
                receive: (d) => displayData(d, emulator1Ref),
                serialOut: (d) => setSerialOut((prev) => prev + String.fromCharCode(d)),
                errorOut: (e) => {
                    setSerialOut(`${e}`);
                    console.error(e);
                },
                debugBackground: (d) => displayData(d, bgDebugger, 256, 256),
                debugTileset: (d) => displayData(d, tilesetDebugger, 128, 192),
                stepCount: setStepCount,
                cyclesPerSec: setCyclesPerSec,
                frameDrawDuration: setMillisPerFrame,
            };

            const gbc = new GameBoyColor(rom, gameIn, gbOut, debug);
            setGameboy(gbc);
            requestAnimationFrame(() => gbc.start());

            if (emulator2Enabled) {
                setTimeout(() => {
                    if (emulator2) {
                        emulator2.error("stop");
                    }
                    // Create Emulator 2 (working)
                    let fileCallback = (d: Uint8Array) => {};
                    const em2 = new GameboyJS.Gameboy(emulator2Ref.current, {
                        romReaders: [
                            {
                                setCallback: (c: (d: Uint8Array) => void) => {
                                    fileCallback = c;
                                },
                            },
                        ],
                    });
                    setEmulator2(em2);
                    fileCallback(rom);
                }, 10);
            }
        },
        [gameboy, emulator2, emulator2Enabled, debugEnabled]
    );

    /**
     * Utility refresh: gets the caches ROM and plays it.
     */
    useEffect(() => {
        const listener = (e: KeyboardEvent) =>
            e.key === "r" && loadedGame && loadGame(loadedGame);
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

        const testFunction = (opcode: number) => {
            const noInput = {
                a: false,
                b: false,
                start: false,
                select: false,
                up: false,
                down: false,
                left: false,
                right: false,
            };

            const rom = new Uint8Array(0x200);
            rom[0x100] = opcode;

            const system = new System(
                rom,
                { read: () => noInput },
                { receive: () => {} },
                () => {}
            );

            const cpu = new CPU();
            let steps = 0;

            do {
                steps += cpu.step(system, true);
                console.log(`stepped, $${cpu.getPC().toString(16).padStart(4, "0")}`);
            } while (cpu["nextStep"] !== null);
            console.log(
                `Operation ${opcode.toString(16).padStart(2, "0")} takes ${steps} cycles.`
            );
        };
        // @ts-ignore
        window.opTestFunction = testFunction;
    }, []);

    /**
     * Sync state with ref
     */
    useEffect(() => {
        emulatorRunning.current = canStep.current = emulatorRunningState;
    }, [emulatorRunningState]);

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            <RomInput type="gb" onLoad={loadRom} />

            <div id="emu-options">
                <button
                    title="Play/Pause"
                    className="icon-button"
                    onClick={(e) => setEmulatorRunningState((s) => !s)}
                >
                    {emulatorRunningState ? <Pause /> : <Play />}
                </button>

                <button
                    title="Step"
                    className="icon-button"
                    onClick={(e) => (canStep.current = true)}
                    disabled={emulatorRunningState}
                >
                    <Redo />
                </button>

                <button
                    title="Debug"
                    className={`icon-button ${debugEnabled ? "toggled" : ""}`}
                    onClick={() => setDebugEnabled(!debugEnabled)}
                >
                    <Bug />
                </button>

                <button
                    title="Emulator 2 Enabled"
                    className={`icon-button ${emulator2Enabled ? "toggled" : ""}`}
                    onClick={() => setEmulator2Enabled(!emulator2Enabled)}
                >
                    <FlipHorizontal />
                </button>
            </div>

            {gameboy && (
                <div id="emu-stack">
                    <div id="emu-stats">
                        <div>{stepCount.toLocaleString()} steps</div>
                        <div>{cyclesPerSec.toLocaleString()} C/s</div>
                        <div>{millisPerFrame.toLocaleString()} ms/f</div>
                    </div>
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
                                    : serialOut.toLowerCase().includes("error")
                                    ? "error"
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
