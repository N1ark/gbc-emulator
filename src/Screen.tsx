import { FunctionalComponent } from "preact";
import { useCallback, MutableRef, useRef, useEffect, useMemo, useState } from "preact/hooks";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./emulator/constants";
import { Identity, ImageFilter } from "./ImageFilter";

type ScreenProps = {
    width?: number;
    height?: number;
    scale?: number;
    inputRef: MutableRef<VideoReceiver | undefined>;
    Filter?: ImageFilter;
};

export type VideoReceiver = (data: Uint32Array) => void;

function mixImages(frame1: Uint32Array, frame2: Uint32Array, target: Uint32Array) {
    for (let index = 0; index < frame1.length; index++) {
        const r1 = (frame1[index] >> 16) & 0xff;
        const g1 = (frame1[index] >> 8) & 0xff;
        const b1 = (frame1[index] >> 0) & 0xff;

        const r2 = (frame2[index] >> 16) & 0xff;
        const g2 = (frame2[index] >> 8) & 0xff;
        const b2 = (frame2[index] >> 0) & 0xff;

        const r = Math.floor((r1 + r2) / 2);
        const g = Math.floor((g1 + g2) / 2);
        const b = Math.floor((b1 + b2) / 2);

        target[index] = (0xff << 24) | (r << 16) | (g << 8) | b;
    }
}

const Screen: FunctionalComponent<ScreenProps> = ({
    inputRef,
    width = SCREEN_WIDTH,
    height = SCREEN_HEIGHT,
    scale = 1,
    Filter = Identity,
}) => {
    const [stateRefresh, setStateRefresh] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const newFrame = useMemo(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            setStateRefresh((state) => state + 1);
            return;
        }

        const currentFrame = new Uint32Array(width * height);
        const previousFrame = new Uint32Array(width * height);

        const filterInstance = new Filter(width, height);
        const dataAsUint8 = new Uint8ClampedArray(filterInstance.output.buffer);
        const imageData = new ImageData(dataAsUint8, ...filterInstance.outputSize);

        const targetWidth = width * scale * window.devicePixelRatio;
        const targetHeight = height * scale * window.devicePixelRatio;

        return (data: Uint32Array) => {
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) return;

            context.imageSmoothingEnabled = false;

            previousFrame.set(currentFrame);
            currentFrame.set(data);

            // We mix both frames into the previous one. This is needed because some games actually
            // flicker entities to display more sprites and have a darker color
            // (example: Link's Awakening chains)
            mixImages(currentFrame, previousFrame, previousFrame);

            // We apply the filter to the frame
            filterInstance.apply(previousFrame);

            // Actual drawing to the canvas - we scale the image to fit the canvas
            createImageBitmap(imageData).then((bitmap) => {
                context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
                bitmap.close();
            });
        };
    }, [stateRefresh, canvasRef.current, width, height, scale, Filter]);

    useEffect(() => {
        inputRef.current = newFrame;
        return () => (inputRef.current = undefined);
    }, [inputRef, newFrame]);

    return (
        <canvas
            ref={canvasRef}
            width={width * scale * window.devicePixelRatio}
            height={height * scale * window.devicePixelRatio}
            style={{
                width: width * scale,
                height: height * scale,
            }}
        />
    );
};

export default Screen;
