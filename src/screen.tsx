import { FunctionalComponent, Ref } from "preact";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";

type ScreenProps = {
    canvasRef?: Ref<HTMLCanvasElement>;
};

const Screen: FunctionalComponent<ScreenProps> = ({ canvasRef }) => (
    <canvas ref={canvasRef} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
);

export default Screen;
