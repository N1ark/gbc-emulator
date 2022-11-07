import { FunctionalComponent, Ref } from "preact";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";

type ScreenProps = {
    ref?: Ref<HTMLCanvasElement>;
};

const Screen: FunctionalComponent<ScreenProps> = ({ ref }) => (
    <canvas ref={ref} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
);

export default Screen;
