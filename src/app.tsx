import { useSignal } from "@preact/signals";
import {
    Bug,
    FastForward,
    FileQuestion,
    Pause,
    Play,
    Redo,
    Volume2,
    VolumeX,
} from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import "./app.css";
import RomInput from "./RomInput";
import Screen, { VideoReceiver } from "./Screen";
import useKeys from "./useKeys";

import localforage from "localforage";
import GameBoyColor from "./emulator/GameBoyColor";
import GameBoyInput from "./emulator/GameBoyInput";
import GameBoyOutput from "./emulator/GameBoyOutput";
import setupTests from "./tests";
import Drawer from "./Drawer/Drawer";

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
    const debugEnabled = useSignal(false);
    const tripleSpeed = useSignal(false);
    const emulatorRunning = useSignal(true);
    const isTesting = useSignal(false);
    const canStep = useSignal(true);
    const hasSound = useSignal(false);

    // DOM Refs
    const emulatorFrameIn = useRef<VideoReceiver | undefined>(undefined);
    const bgDebugger = useRef<VideoReceiver | undefined>(undefined);
    const tilesetDebugger = useRef<VideoReceiver | undefined>(undefined);

    // Emulator data
    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const serialOut = useSignal("");

    // Debug state
    const cyclesPerSec = useSignal(0);
    const stepCount = useSignal(0);
    const millisPerFrame = useSignal(0);

    /**
     * Loads a ROM into the gameboy, instantiating it. Also creates the 2nd emulator if needed
     */
    const loadGame = useCallback(
        (rom: Uint8Array) => {
            if (gameboy) {
                gameboy.stop();
                serialOut.value = "";
            }
            const gameIn: GameBoyInput = {
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
                get receive() {
                    return emulatorFrameIn.current;
                },
                hasSoundEnabled: () => hasSound.value,
                serialOut: (d) => (serialOut.value += String.fromCharCode(d)),
                errorOut: (e) => {
                    serialOut.value = `${e}`;
                    console.error(e);
                },
                get debugBackground() {
                    return bgDebugger.current;
                },
                get debugTileset() {
                    return tilesetDebugger.current;
                },
                stepCount: (x) => (stepCount.value = x),
                cyclesPerSec: (x) => (cyclesPerSec.value = x),
                frameDrawDuration: (x) => (millisPerFrame.value = x),
            };

            const gbc = new GameBoyColor(rom, gameIn, gbOut, debug);
            setGameboy(gbc);
            requestAnimationFrame(() => gbc.start());

            // @ts-ignore helpful for debugging :)
            window.gbc = gbc;

            return gbc;
        },
        [gameboy, debugEnabled]
    );

    /**
     * Utility refresh: gets the caches ROM and plays it.
     */
    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (e.key === "r" && loadedGame) {
                var target = (e.target || e.srcElement) as HTMLElement;
                var targetTagName = target === null ? "null" : target.nodeName.toUpperCase();
                if (/INPUT|SELECT|TEXTAREA/.test(targetTagName)) {
                    return;
                }
                loadGame(loadedGame);
            }
        };
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

    useEffect(setupTests, []);

    return (
        <>
            <Drawer />

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
                    title="Sound"
                    className="icon-button"
                    onClick={() => (hasSound.value = !hasSound.value)}
                >
                    {hasSound.value ? <Volume2 /> : <VolumeX />}
                </button>

                <button
                    title="Debug"
                    className={`icon-button ${debugEnabled.value ? "toggled" : ""}`}
                    onClick={() => (debugEnabled.value = !debugEnabled.value)}
                >
                    <Bug />
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
                        <Screen inputRef={emulatorFrameIn} />
                        {debugEnabled.value && (
                            <>
                                <Screen width={256} height={256} inputRef={bgDebugger} />
                                <Screen width={128} height={192} inputRef={tilesetDebugger} />
                            </>
                        )}
                    </div>
                    {serialOut.value.length > 0 && (
                        <code
                            className={
                                serialOut.value.toLowerCase().includes("error")
                                    ? "error"
                                    : serialOut.value.toLowerCase().includes("failed")
                                    ? "failed"
                                    : serialOut.value.toLowerCase().includes("passed")
                                    ? "passed"
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
