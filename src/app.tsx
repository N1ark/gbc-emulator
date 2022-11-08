import { useState } from "preact/hooks";
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
    const screenRef = createRef<HTMLCanvasElement>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();

    const loadRom = (rom: string) => {
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

        const debug = () => ({ canStep: pressedKeys.includes(" ") });

        const videoOut: VideoOutput = {
            receive: (data) => {
                const canvas = screenRef.current;
                if (!canvas) return;

                console.log(canvas);

                const context = canvas.getContext("2d");
                if (!context) return;

                const imageData = new ImageData(data, SCREEN_WIDTH, SCREEN_HEIGHT);
                context.putImageData(imageData, 0, 0);
            },
        };

        const gbc = new GameBoyColor(rom, gameIn, videoOut, debug);
        setGameboy(gbc);

        requestAnimationFrame(() => gbc.run());
    };

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            {gameboy ? <Screen ref={screenRef} /> : <RomInput type="gb" onLoad={loadRom} />}
        </>
    );
};

export default App;
