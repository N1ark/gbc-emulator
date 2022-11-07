import { useRef, useState } from "preact/hooks";
import "./app.css";
import { createRef, FunctionalComponent } from "preact";
import RomInput from "./RomInput";
import Screen from "./screen";
import GameBoyColor from "./emulator/GameBoyColor";
import VideoOutput from "./emulator/VideoOutput";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import GameInput from "./emulator/GameInput";

const App: FunctionalComponent = () => {
    const screenRef = createRef<HTMLCanvasElement>();
    const [gameboy, setGameboy] = useState<GameBoyColor>();

    const loadRom = (rom: string) => {
        const gameIn: GameInput = {
            read: () => ({
                up: false,
                down: false,
                left: false,
                right: false,
                a: false,
                b: false,
                start: false,
                select: false,
            }),
        };

        const videoOut: VideoOutput = {
            receive: (data) => {
                console.log("receiving data", data);
                const canvas = screenRef.current;
                if (!canvas) return;

                console.log(canvas);

                const context = canvas.getContext("2d");
                if (!context) return;

                const imageData = new ImageData(data, SCREEN_WIDTH, SCREEN_HEIGHT);
                context.putImageData(imageData, 0, 0);
            },
        };

        const gbc = new GameBoyColor(rom, gameIn, videoOut);
        setGameboy(gbc);

        requestAnimationFrame(() => gbc.run());
    };

    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            {gameboy ? <Screen ref={screenRef} /> : <RomInput onLoad={loadRom} />}
        </>
    );
};

export default App;
