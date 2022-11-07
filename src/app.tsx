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
    return (
        <>
            <h1>Emmy</h1>
            <h2>The GBC Browser Emulator</h2>

            {gameboy ? <Screen ref={screenRef} /> : <RomInput onLoad={loadRom} />}
        </>
    );
};

export default App;
