import { FunctionalComponent } from "preact";
import { useCallback, MutableRef, useRef, useEffect, useMemo } from "preact/hooks";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";

type ScreenProps = {
    width?: number;
    height?: number;
    scale?: number;
    inputRef: MutableRef<VideoReceiver | undefined>;
};

export type VideoReceiver = (data: Uint32Array) => void;

const Screen: FunctionalComponent<ScreenProps> = ({
    inputRef,
    width = SCREEN_WIDTH,
    height = SCREEN_HEIGHT,
    scale = 1,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const newFrame = useMemo(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const currentFrame = new Uint32Array(width * height);
        const previousFrame = new Uint32Array(width * height);
        const dataAsUint8 = new Uint8ClampedArray(previousFrame.buffer);
        const imageData = new ImageData(dataAsUint8, width, height);

        const targetWidth = width * scale;
        const targetHeight = height * scale;

        return (data: Uint32Array) => {
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) return;

            context.imageSmoothingEnabled = false;

            previousFrame.set(currentFrame);
            currentFrame.set(data);

            // We mix both frames into the previous one. This is needed because some games actually
            // flicker entities to display more sprites and have a darker color
            // (example: Link's Awakening chains)
            previousFrame.forEach((value, index) => {
                const r1 = (value >> 16) & 0xff;
                const g1 = (value >> 8) & 0xff;
                const b1 = (value >> 0) & 0xff;

                const r2 = (currentFrame[index] >> 16) & 0xff;
                const g2 = (currentFrame[index] >> 8) & 0xff;
                const b2 = (currentFrame[index] >> 0) & 0xff;

                const r = Math.floor((r1 + r2) / 2);
                const g = Math.floor((g1 + g2) / 2);
                const b = Math.floor((b1 + b2) / 2);

                previousFrame[index] = (0xff << 24) | (r << 16) | (g << 8) | b;
            });

            // Actual drawing to the canvas - we scale the image to fit the canvas
            createImageBitmap(imageData).then((bitmap) => {
                context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
                bitmap.close();
            });
        };
    }, [canvasRef.current, width, height, scale]);

    useEffect(() => {
        inputRef.current = newFrame;
        return () => (inputRef.current = undefined);
    }, [inputRef, newFrame]);

    return <canvas ref={canvasRef} width={width * scale} height={height * scale} />;
};

export default Screen;
