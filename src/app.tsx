import { useEffect, useRef, useState } from "preact/hooks";
import "./app.css";
import { createRef, FunctionalComponent } from "preact";
import RomInput from "./RomInput";
import Screen from "./screen";
import GameBoyColor from "./emulator/GameBoyColor";
import VideoOutput from "./emulator/VideoOutput";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameInput from "./emulator/GameInput";
import useKeys from "./useKeys";

const App: FunctionalComponent = () => {
    const pressedKeys = useKeys();
    const screenRef = useRef<HTMLCanvasElement>(null);
    const [gameboy, setGameboy] = useState<GameBoyColor>();

    document.addEventListener("keydown", (e) => {
        if (e.key === "z" && gameboy === undefined) {
            fetch("/test_cpu.gb")
                .then((r) => r.blob())
                .then((b) => b.arrayBuffer())
                .then((txt) => {
                    console.log(txt);
                    loadRom(txt);
                });
        }
    });
    const loadRom = (rom: ArrayBuffer) => {
        const gameIn: GameInput = {
            read: () => ({
                up: pressedKeys.includes("arrowup"),
                down: pressedKeys.includes("arrowdown"),
                left: pressedKeys.includes("arrowleft"),
                right: pressedKeys.includes("arrowright"),
                a: pressedKeys.includes("q"),
                b: pressedKeys.includes("a"),
                start: pressedKeys.includes("w"),
                select: pressedKeys.includes("s"),
            }),
        };

        const debug = () => ({
            canStep: pressedKeys.includes(" "),
            skipDebug: pressedKeys.includes("escape"),
        });

        const videoOut: VideoOutput = {
            receive: (data) => {
                const canvas = screenRef.current;
                if (!canvas) return;

                const context = canvas.getContext("2d");
                if (!context) return;

                const dataAsUint8 = new Uint8ClampedArray(data.buffer);
                const imageData = new ImageData(dataAsUint8, SCREEN_WIDTH, SCREEN_HEIGHT);
                context.putImageData(imageData, 0, 0);
            },
        };
        const romArray = new Uint8Array(rom);
        const gbc = new GameBoyColor(romArray, gameIn, videoOut, debug);
        setGameboy(gbc);

        requestAnimationFrame(() => gbc.run());
    };

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            {gameboy ? (
                <Screen canvasRef={screenRef} />
            ) : (
                <RomInput type="gb" onLoad={loadRom} />
            )}
        </>
    );
};

export default App;
