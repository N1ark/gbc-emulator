import { useSignal } from "@preact/signals";
import localforage from "localforage";
import { FastForward, Pause, Play, Redo, Save, Volume2, VolumeX } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import AudioPlayer from "@helpers/AudioPlayer";
import { useConfig } from "@helpers/ConfigContext";

import { addAlert, AlertManager } from "@components/Alerts";
import Drawer from "@components/Drawer/Drawer";
import GameInput from "@components/GameInput";
import IconButton from "@components/IconButton";
import RomInput from "@components/RomInput";
import Screen, { VideoReceiver } from "@components/Screen";

import GameBoyColor from "@emulator/GameBoyColor";
import GameBoyInput from "@emulator/GameBoyInput";
import GameBoyOutput from "@emulator/GameBoyOutput";

const CACHE_KEY = "rom";
const SAVE_CACHE_KEY = "save_";

const App: FunctionalComponent = () => {
    // Interaction
    const tripleSpeed = useSignal(false);
    const emulatorRunning = useSignal(true);
    const canStep = useSignal(true);
    const [config, setConfig] = useConfig();
    const volume = useSignal(config.volume);
    useEffect(() => {
        volume.value = config.volume;
    }, [config.volume]);
    const soundOutput = useSignal<AudioPlayer | undefined>(undefined);
    const joypadInput = useSignal<undefined | GameBoyInput>(undefined);

    // DOM Refs
    const emulatorFrameIn = useRef<VideoReceiver | undefined>(undefined);
    const bgDebugger = useRef<VideoReceiver | undefined>(undefined);
    const tilesetDebugger = useRef<VideoReceiver | undefined>(undefined);

    // Emulator data
    const [loadedGame, setLoadedGame] = useState<Uint8Array>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();

    const effectivePalette = gameboy?.getMode() === "DMG" ? config.gbPalette : undefined;

    // Debug state
    const cyclesPerSec = useRef<HTMLDivElement>(null);
    const stepCount = useRef<HTMLDivElement>(null);
    const millisPerFrame = useRef<HTMLDivElement>(null);

    const toggleHasSound = () => {
        const audioEnabled = !config.audioEnabled;
        setConfig({ audioEnabled });
        if (audioEnabled) {
            soundOutput.value = new AudioPlayer(volume);
        } else {
            soundOutput.value?.delete();
            delete soundOutput.value;
        }
    };

    const saveGame = useCallback(() => {
        if (gameboy) {
            const save = gameboy.save();
            if (save) {
                localforage.setItem(SAVE_CACHE_KEY + gameboy.getIdentifier(), save, (err) => {
                    if (err)
                        console.error(
                            `Could not save game ${gameboy.getTitle()} (${gameboy.getIdentifier()}):`,
                            err
                        );
                    else {
                        console.log(
                            `Saved game ${gameboy.getTitle()} (${gameboy.getIdentifier()})`
                        );
                        addAlert(`Saved game '${gameboy.getTitle()}'`);
                    }
                });
            }
        }
    }, [gameboy]);

    /** Backup  */
    useEffect(() => {
        window.addEventListener("beforeunload", saveGame);
        return () => window.removeEventListener("beforeunload", saveGame);
    }, [saveGame]);

    /**
     * Loads a ROM into the gameboy, instantiating it. Also creates the 2nd emulator if needed
     */
    const loadGame = useCallback(
        (rom: Uint8Array) => {
            /** Save previous state, clear variables */
            saveGame();

            /** Setup input (we can't pass the value directly, because the object might change) */
            const gameIn: GameBoyInput = {
                read: () => joypadInput.value!.read(),
            };

            /** Setup output (relies on most things not changing) */
            let serialOutTxt = "";
            const gbOut: GameBoyOutput = {
                get receiveGraphics() {
                    return emulatorFrameIn.current;
                },
                receiveSound: (d) => soundOutput.value?.enqueue(d),
                serialOut: (d) => {
                    serialOutTxt += String.fromCharCode(d);
                    console.log("Serial out > ", serialOutTxt);
                },
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

            /** Create the emulator (ensure it loads correctly.) */
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
            addAlert(`Loaded game '${gbc.getTitle()}'`);

            /** Load a save (if one exists) */
            localforage.getItem<Uint8Array>(
                SAVE_CACHE_KEY + gbc.getIdentifier(),
                (err, save) => {
                    if (save) {
                        try {
                            gbc.load(save);
                            console.log(
                                `Loaded save for ${gbc.getTitle()} (${gbc.getIdentifier()})`
                            );
                            addAlert(`Loaded save for '${gbc.getTitle()}'`);
                        } catch (e) {
                            console.error(
                                `Could not load save for ${gbc.getTitle()} (${gbc.getIdentifier()}):`,
                                e
                            );
                        }
                    }
                }
            );

            setGameboy(gbc);

            /** Run the emulator (this is the "main loop") */
            const runEmulator = () => {
                /**
                 * This is a bit of a hack to ensure that the emulator doesn't run if the
                 * instance has changed. It doesn't update the state, because the instance
                 * remains the same.
                 * This relies on the fact the state setter (setGameboy) doesn't change and is
                 * synchronous.
                 */
                const expectedInstance = gbc;
                let currentInstance: GameBoyColor | undefined = undefined;
                setGameboy((g) => (currentInstance = g));

                // if the instance has changed, stop this loop.
                if (currentInstance !== expectedInstance) return;

                /** Run the emulator */
                const speed = tripleSpeed.value ? 3 : 1;
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
        [gameboy, config]
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
        localforage.getItem<Uint8Array>(CACHE_KEY, (err, value) => {
            if (!value) return;
            setLoadedGame(value);
            loadGame(value);
        });
    }, []);

    return (
        <>
            <AlertManager />
            <Drawer loadRom={loadRom} />

            <div id="emulator">
                <h1>Emmy</h1>
                <h2>The GBC Browser Emulator</h2>

                <RomInput onLoad={loadRom} />

                <div id="emu-options">
                    <IconButton
                        title="Play/Pause"
                        Icon={emulatorRunning.value ? Pause : Play}
                        onClick={() =>
                            (emulatorRunning.value = canStep.value = !emulatorRunning.value)
                        }
                        showTooltip
                    />

                    <IconButton
                        title="Step"
                        Icon={Redo}
                        onClick={() => (canStep.value = true)}
                        disabled={emulatorRunning.value}
                        showTooltip
                    />

                    <IconButton
                        title="Sound Enabled"
                        onClick={toggleHasSound}
                        Icon={config.audioEnabled ? Volume2 : VolumeX}
                        showTooltip
                    />

                    <IconButton
                        id="emu-speed"
                        title="Triple Speed"
                        onClick={() => (tripleSpeed.value = !tripleSpeed.value)}
                        Icon={FastForward}
                        toggled={tripleSpeed.value}
                        showTooltip
                    />

                    <IconButton
                        title="Save Game"
                        onClick={() => saveGame()}
                        Icon={Save}
                        showTooltip
                    />
                </div>

                {gameboy && (
                    <div id="emu-stack">
                        {config.showStats && (
                            <div id="emu-stats">
                                <div ref={stepCount} />
                                <div ref={cyclesPerSec} />
                                <div ref={millisPerFrame} />
                            </div>
                        )}
                        <Screen
                            inputRef={emulatorFrameIn}
                            scale={1 << config.scale}
                            Filter={config.filter}
                            blending={config.frameBlending}
                            palette={effectivePalette}
                            id="emulator-frame"
                        />
                    </div>
                )}

                <GameInput inputHandler={(x) => (joypadInput.value = x)} />

                {gameboy && config.showDebugScreens && (
                    <div id="emu-screens">
                        <Screen width={256} height={256} inputRef={bgDebugger} />
                        <Screen width={256} height={192} inputRef={tilesetDebugger} />
                    </div>
                )}
            </div>
        </>
    );
};

export default App;
