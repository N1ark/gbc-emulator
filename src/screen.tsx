import { FunctionalComponent } from "preact";
import { Ref } from "preact/hooks";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";

type ScreenProps = {
    width?: number;
    height?: number;
    canvasRef?: Ref<HTMLCanvasElement>;
};

const Screen: FunctionalComponent<ScreenProps> = ({ canvasRef, width, height }) => (
    <canvas ref={canvasRef} width={width ?? SCREEN_WIDTH} height={height ?? SCREEN_HEIGHT} />
);

export default Screen;
