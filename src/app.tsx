// @ts-ignore
import GameboyJS from "./emulator2";

import { FunctionalComponent } from "preact";
import { signal, useSignal } from "@preact/signals";
import { Ref, useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
    Play,
    Pause,
    Redo,
    Bug,
    FlipHorizontal,
    FileQuestion,
    FastForward,
} from "lucide-preact";

import "./app.css";
import GameInput from "./emulator/GameInput";
import RomInput from "./RomInput";
import Screen from "./Screen";
import useKeys from "./useKeys";

import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameBoyColor from "./emulator/GameBoyColor";
import GameBoyOutput from "./emulator/GameBoyOutput";
import localforage from "localforage";
import { testConfig, testFiles } from "./testConfig";
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

    // Interaction
    const emulator2Enabled = useSignal(false);
    const debugEnabled = useSignal(false);
    const tripleSpeed = useSignal(false);
    const emulatorRunning = useSignal(true);
    const isTesting = useSignal(false);
    const canStep = useSignal(true);

    // DOM Refs
    const emulator1Ref = useRef<HTMLCanvasElement>(null);
    const emulator2Ref = useRef<HTMLCanvasElement>(null);
    const bgDebugger = useRef<HTMLCanvasElement>(null);
    const tilesetDebugger = useRef<HTMLCanvasElement>(null);

    // Emulator data
    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const [emulator2, setEmulator2] = useState<any>();
    const serialOut = useSignal("");

    // Debug state
    const cyclesPerSec = useSignal(0);
    const stepCount = useSignal(0);
    const millisPerFrame = useSignal(0);

    /**
     * Stop em2 if needed
     */
    useEffect(() => {
        if (emulator2 && !emulator2Enabled.value) {
            emulator2.error("stop");
        }
    }, [emulator2Enabled.value, emulator2]);

    /**
     * Loads a ROM into the gameboy, instantiating it. Also creates the 2nd emulator if needed
     */
    const loadGame = useCallback(
        (rom: Uint8Array) => {
            if (gameboy) {
                gameboy.stop();
                serialOut.value = "";
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
                const step = canStep.value;
                if (step) {
                    canStep.value = false;
                }
                return {
                    canStep: step,
                    skipDebug: emulatorRunning.value,
                    tripleSpeed: tripleSpeed.value,
                };
            };

            const gbOut: GameBoyOutput = {
                receive: (d) => displayData(d, emulator1Ref),
                serialOut: (d) => (serialOut.value += String.fromCharCode(d)),
                errorOut: (e) => {
                    serialOut.value = `${e}`;
                    console.error(e);
                },
                debugBackground: (d) => displayData(d, bgDebugger, 256, 256),
                debugTileset: (d) => displayData(d, tilesetDebugger, 128, 192),
                stepCount: (x) => (stepCount.value = x),
                cyclesPerSec: (x) => (cyclesPerSec.value = x),
                frameDrawDuration: (x) => (millisPerFrame.value = x),
            };

            const gbc = new GameBoyColor(rom, gameIn, gbOut, debug);
            setGameboy(gbc);
            requestAnimationFrame(() => gbc.start());

            if (emulator2Enabled.value) {
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

            return gbc;
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

        const testOpSpeed = () => {
            const speeds = [
                1, 3, 2, 2, 1, 1, 2, 1, 5, 2, 2, 2, 1, 1, 2, 1, 0, 3, 2, 2, 1, 1, 2, 1, 3, 2, 2,
                2, 1, 1, 2, 1, 2, 3, 2, 2, 1, 1, 2, 1, 2, 2, 2, 2, 1, 1, 2, 1, 2, 3, 2, 2, 3, 3,
                3, 1, 2, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1,
                1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1,
                1, 1, 2, 1, 2, 2, 2, 2, 2, 2, 0, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2,
                1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1,
                1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1,
                1, 2, 1, 2, 3, 3, 4, 3, 4, 2, 4, 2, 4, 3, 0, 3, 6, 2, 4, 2, 3, 3, 0, 3, 4, 2, 4,
                2, 4, 3, 0, 3, 0, 2, 4, 3, 3, 2, 0, 0, 4, 2, 4, 4, 1, 4, 0, 0, 0, 2, 4, 3, 3, 2,
                1, 0, 4, 2, 4, 3, 2, 4, 1, 0, 0, 2, 4,
            ];
            for (let op = 0; op < 0xff; op++) {
                if (speeds[op] === 0) continue;
                const rom = new Uint8Array(0x200);
                rom[0x100] = op;
                const system = new System(
                    rom,
                    {
                        read: () => ({
                            a: false,
                            b: false,
                            select: false,
                            start: false,
                            down: false,
                            up: false,
                            left: false,
                            right: false,
                        }),
                    },
                    {},
                    () => {}
                );
                const cpu = new CPU();
                let steps = 0;
                do {
                    cpu.step(system);
                    steps++;
                } while (cpu["nextStep"] !== null);
                if (speeds[op] !== steps) {
                    console.log(
                        `Step mismatch for op ${op.toString(16)}: got ${steps}, expected ${
                            speeds[op]
                        }`
                    );
                }
            }
        };
        // @ts-ignore
        window.opTest = testOpSpeed;
    }, []);

    /**
     * Handles the testing system
     */
    useEffect(() => {
        if (!isTesting.value) return;

        (async () => {
            let testResults: Record<string, { type: string; group: string; state: string }> =
                {};
            for (let testType in testFiles) {
                const groups = testFiles[testType as keyof typeof testFiles];
                console.log(`---- Starting tests "${testType}" ----`);
                for (let group in groups) {
                    const groupFiles = groups[group as keyof typeof groups] as string[];
                    for (let testFile of groupFiles) {
                        console.log(`Running test ${testType}/${group} -> ${testFile}`);
                        const getTestState = testConfig[testType as keyof typeof testFiles];
                        const romResponse = await fetch(`/tests/${testType}/${testFile}.gb`);
                        const romBlob = await romResponse.blob();
                        const romArrayBuffer = await romBlob.arrayBuffer();
                        try {
                            const gbc = loadGame(new Uint8Array(romArrayBuffer));
                            while (isTesting) {
                                const state =
                                    gbc["cpu"]["stepCounter"] > 10_000_000
                                        ? "timeout"
                                        : getTestState(gbc, serialOut.value);
                                if (state !== null) {
                                    testResults[testFile] = {
                                        type: testType,
                                        group,
                                        state:
                                            state === "failure"
                                                ? "❌"
                                                : state === "timeout"
                                                ? "⌛"
                                                : "✅",
                                    };
                                    break;
                                }
                                await new Promise((resolve) => setTimeout(resolve, 100));
                            }
                            gbc.stop();
                        } catch (e) {
                            console.error("Caught error, skipping test", e);
                            testResults[testFile] = {
                                type: testType,
                                group,
                                state: "🪦",
                            };
                        }
                        if (!isTesting) return;
                        console.table(testResults);
                    }
                }
            }
            emulatorRunning.value = false;
            console.log(
                `Finished running tests! Passed ${
                    Object.values(testResults).filter((x) => x.state === "✅").length
                }/${Object.keys(testResults).length}`
            );
        })();
    }, [isTesting.value]);

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            <RomInput type="gb" onLoad={loadRom} />

            <div id="emu-options">
                <button
                    title="Play/Pause"
                    className="icon-button"
                    onClick={() =>
                        (emulatorRunning.value = canStep.value = !emulatorRunning.value)
                    }
                >
                    {emulatorRunning.value ? <Pause /> : <Play />}
                </button>

                <button
                    title="Step"
                    className="icon-button"
                    onClick={() => (canStep.value = true)}
                    disabled={emulatorRunning.value}
                >
                    <Redo />
                </button>

                <button
                    title="Debug"
                    className={`icon-button ${debugEnabled.value ? "toggled" : ""}`}
                    onClick={() => (debugEnabled.value = !debugEnabled.value)}
                >
                    <Bug />
                </button>

                <button
                    title="Emulator 2 Enabled"
                    className={`icon-button ${emulator2Enabled.value ? "toggled" : ""}`}
                    onClick={() => (emulator2Enabled.value = !emulator2Enabled.value)}
                >
                    <FlipHorizontal />
                </button>

                <button
                    title="Testing"
                    className={`icon-button ${isTesting.value ? "toggled" : ""}`}
                    onClick={() => (isTesting.value = !isTesting.value)}
                >
                    <FileQuestion />
                </button>

                <button
                    title="Double Speed"
                    className={`icon-button ${tripleSpeed.value ? "toggled" : ""}`}
                    onClick={() => (tripleSpeed.value = !tripleSpeed.value)}
                >
                    <FastForward />
                </button>
            </div>

            {gameboy && (
                <div id="emu-stack">
                    <div id="emu-stats">
                        <div>{stepCount.value.toLocaleString()} steps</div>
                        <div>{cyclesPerSec.value.toLocaleString()} C/s</div>
                        <div>{millisPerFrame.value.toLocaleString()} ms/f</div>
                    </div>
                    <div id="emu-screens">
                        <Screen canvasRef={emulator1Ref} />
                        {emulator2Enabled.value && <Screen canvasRef={emulator2Ref} />}
                        {debugEnabled.value && (
                            <>
                                <Screen width={256} height={256} canvasRef={bgDebugger} />
                                <Screen width={128} height={192} canvasRef={tilesetDebugger} />
                            </>
                        )}
                    </div>
                    {serialOut.value.length > 0 && (
                        <code
                            className={
                                serialOut.value.toLowerCase().includes("passed")
                                    ? "passed"
                                    : serialOut.value.toLowerCase().includes("failed")
                                    ? "failed"
                                    : serialOut.value.toLowerCase().includes("error")
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
