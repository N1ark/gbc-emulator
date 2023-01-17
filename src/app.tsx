import { useSignal } from "@preact/signals";
import { Bug, FastForward, Pause, Play, Redo, Volume2, VolumeX } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import localforage from "localforage";

import RomInput from "@components/RomInput";
import Screen, { VideoReceiver } from "@components/Screen";
import useKeys from "@/helpers/useKeys";

import Drawer from "@components/Drawer/Drawer";
import IconButton from "@/components/IconButton";
import GameBoyColor from "@emulator/GameBoyColor";
import GameBoyInput from "@emulator/GameBoyInput";
import GameBoyOutput from "@emulator/GameBoyOutput";
import AudioPlayer from "@/helpers/AudioPlayer";
import { useConfig } from "./helpers/ConfigContext";

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
    const canStep = useSignal(true);
    const [config, setConfig] = useConfig();
    const soundOutput = useSignal<AudioPlayer | undefined>(undefined);

    // DOM Refs
    const emulatorFrameIn = useRef<VideoReceiver | undefined>(undefined);
    const bgDebugger = useRef<VideoReceiver | undefined>(undefined);
    const tilesetDebugger = useRef<VideoReceiver | undefined>(undefined);

    // Emulator data
    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();
    const serialOut = useSignal("");

    // Debug state
    const cyclesPerSec = useRef<HTMLDivElement>(null);
    const stepCount = useRef<HTMLDivElement>(null);
    const millisPerFrame = useRef<HTMLDivElement>(null);

    const toggleHasSound = () => {
        const audioEnabled = !config.audioEnabled;
        setConfig({ audioEnabled });
        if (audioEnabled) {
            soundOutput.value = new AudioPlayer();
        } else {
            soundOutput.value?.delete();
            delete soundOutput.value;
        }
    };

    /**
     * Loads a ROM into the gameboy, instantiating it. Also creates the 2nd emulator if needed
     */
    const loadGame = useCallback(
        (rom: Uint8Array) => {
            serialOut.value = "";

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

            const gbOut: GameBoyOutput = {
                get receive() {
                    return emulatorFrameIn.current;
                },
                receiveSound: (d) => soundOutput.value?.enqueue(d),
                serialOut: (d) => (serialOut.value += String.fromCharCode(d)),
                get debugBackground() {
                    return bgDebugger.current;
                },
                get debugTileset() {
                    return tilesetDebugger.current;
                },
                stepCount: (x) => {
                    if (stepCount.current)
                        stepCount.current.innerHTML = `${x.toLocaleString()} steps`;
                },
                cyclesPerSec: (x) => {
                    if (cyclesPerSec.current)
                        cyclesPerSec.current.innerHTML = `${x.toLocaleString()} cycles/s`;
                },
                frameDrawDuration: (x) => {
                    if (millisPerFrame.current)
                        millisPerFrame.current.innerHTML = `${x.toLocaleString()} ms/frame`;
                },
            };

            let gbc: GameBoyColor;
            try {
                gbc = new GameBoyColor(
                    config.console === "dmg" ? "DMG" : "CGB",
                    rom,
                    gameIn,
                    gbOut,
                    {
                        bootRom: config.bootRom,
                    }
                );
            } catch (e) {
                alert("Could not load ROM: " + e);
                return;
            }
            setGameboy(gbc);

            const runEmulator = () => {
                const expectedInstance = gbc;
                let currentInstance: GameBoyColor | undefined = undefined;
                setGameboy((g) => (currentInstance = g)); // update the current instance

                // if the instance has changed, don't run the emulator
                if (currentInstance !== expectedInstance) return;

                const speed = tripleSpeed.value ? 4 : 1;
                const brokeExecution = gbc.drawFrame(speed, !emulatorRunning.value);

                /** Need to handle wait for a step to be made. */
                if (brokeExecution) {
                    emulatorRunning.value = false;
                    const waitForStep = () => {
                        if (canStep.value || emulatorRunning.value) {
                            canStep.value = false;
                            runEmulator();
                        } else {
                            requestAnimationFrame(waitForStep);
                        }
                    };
                    requestAnimationFrame(waitForStep);
                } else {
                    requestAnimationFrame(runEmulator);
                }
            };

            requestAnimationFrame(runEmulator);

            // @ts-ignore helpful for debugging :)
            window.gbc = gbc;

            return gbc;
        },
        [gameboy, debugEnabled, config]
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

    return (
        <>
            <Drawer loadRom={(rom) => loadGame(rom)} />

            <div id="emulator">
                <h1>Emmy</h1>
                <h2>The GBC Browser Emulator</h2>

                <RomInput type="gb" onLoad={loadRom} />

                <div id="emu-options">
                    <IconButton
                        title="Play/Pause"
                        Icon={emulatorRunning.value ? Pause : Play}
                        onClick={() =>
                            (emulatorRunning.value = canStep.value = !emulatorRunning.value)
                        }
                    />

                    <IconButton
                        title="Step"
                        Icon={Redo}
                        onClick={() => (canStep.value = true)}
                        disabled={emulatorRunning.value}
                    />

                    <IconButton
                        title="Sound"
                        onClick={toggleHasSound}
                        Icon={config.audioEnabled ? Volume2 : VolumeX}
                    />

                    <IconButton
                        title="Debug"
                        onClick={() => (debugEnabled.value = !debugEnabled.value)}
                        Icon={Bug}
                        toggled={debugEnabled.value}
                    />

                    <IconButton
                        title="Double Speed"
                        onClick={() => (tripleSpeed.value = !tripleSpeed.value)}
                        Icon={FastForward}
                        toggled={tripleSpeed.value}
                    />
                </div>

                {gameboy && (
                    <div id="emu-stack">
                        <div id="emu-stats">
                            <div ref={stepCount} />
                            <div ref={cyclesPerSec} />
                            <div ref={millisPerFrame} />
                        </div>
                        <div id="emu-screens">
                            <Screen
                                inputRef={emulatorFrameIn}
                                scale={1 << config.scale}
                                Filter={config.filter}
                                blending={config.frameBlending}
                            />
                            {debugEnabled.value && (
                                <>
                                    <Screen width={256} height={256} inputRef={bgDebugger} />
                                    <Screen
                                        width={128}
                                        height={192}
                                        inputRef={tilesetDebugger}
                                    />
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
            </div>
        </>
    );
};

export default App;
