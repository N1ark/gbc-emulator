import { FunctionalComponent } from "preact";
import { useCallback, MutableRef, useRef, useEffect } from "preact/hooks";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";

type ScreenProps = {
    width?: number;
    height?: number;
    inputRef: MutableRef<VideoReceiver | undefined>;
};

export type VideoReceiver = (data: Uint32Array) => void;

const Screen: FunctionalComponent<ScreenProps> = ({
    inputRef,
    width = SCREEN_WIDTH,
    height = SCREEN_HEIGHT,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const currentFrame = useRef<Uint32Array>(new Uint32Array(width * height));
    const previousFrame = useRef<Uint32Array>(new Uint32Array(width * height));

    const newFrame = useCallback(
        (data: Uint32Array) => {
            const curFrame = currentFrame.current;
            const preFrame = previousFrame.current;

            preFrame.set(curFrame);
            curFrame.set(data);

            // We mix both frames into the previous one. This is needed because some games actually
            // flicker entities to display more sprites and have a darker color
            // (example: Link's Awakening chains)
            preFrame.forEach((value, index) => {
                const r1 = (value >> 16) & 0xff;
                const g1 = (value >> 8) & 0xff;
                const b1 = (value >> 0) & 0xff;

                const r2 = (curFrame[index] >> 16) & 0xff;
                const g2 = (curFrame[index] >> 8) & 0xff;
                const b2 = (curFrame[index] >> 0) & 0xff;

                const r = Math.floor(r1 + r2) / 2;
                const g = Math.floor(g1 + g2) / 2;
                const b = Math.floor(b1 + b2) / 2;

                preFrame[index] = (0xff << 24) | (r << 16) | (g << 8) | b;
            });

            const canvas = canvasRef.current;
            if (!canvas) return;

            const context = canvas.getContext("2d");
            if (!context) return;

            const dataAsUint8 = new Uint8ClampedArray(preFrame.buffer);
            const imageData = new ImageData(dataAsUint8, width, height);
            context.putImageData(imageData, 0, 0);
        },
        [canvasRef]
    );

    useEffect(() => {
        inputRef.current = newFrame;
        return () => (inputRef.current = undefined);
    }, [inputRef, newFrame]);

    return <canvas ref={canvasRef} width={width} height={height} />;
};

export default Screen;
