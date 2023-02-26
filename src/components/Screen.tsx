import { FunctionalComponent } from "preact";
import { MutableRef, useRef, useEffect, useMemo, useState } from "preact/hooks";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "@emulator/constants";
import { Identity, ImageFilter } from "@/helpers/ImageFilter";

type ScreenProps = {
    width?: number;
    height?: number;
    scale?: number;
    inputRef: MutableRef<VideoReceiver | undefined>;
    Filter?: ImageFilter;
    blending?: boolean;
    id?: string;
    palette?: Partial<Record<number, number>>;
};

export type VideoReceiver = (data: Uint32Array) => void;

function applyPalette(frame: Uint32Array, palette: Partial<Record<number, number>>) {
    for (let index = 0; index < frame.length; index++) {
        frame[index] = palette[frame[index]] ?? frame[index];
    }
}

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
    blending = false,
    id,
    palette,
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

        let firstFrame = true;

        return (data: Uint32Array) => {
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) return;

            context.imageSmoothingEnabled = false;

            previousFrame.set(currentFrame);
            currentFrame.set(data);

            if (palette) {
                // Apply the color palette if needed
                applyPalette(currentFrame, palette);
            }

            if (firstFrame) {
                firstFrame = false;
                // We copy the current frame into the previous one as it is entirely black
                // This avoid a black frame at the beginning
                previousFrame.set(currentFrame);
            }

            if (blending) {
                // We mix both frames into the previous one. This is needed because some games actually
                // flicker entities to display more sprites and have a darker color
                // (example: Link's Awakening chains)
                mixImages(currentFrame, previousFrame, previousFrame);
            } else {
                // We copy the current frame into the previous one to avoid a one frame delay
                previousFrame.set(currentFrame);
            }

            // We apply the filter to the frame
            filterInstance.apply(previousFrame);

            // Actual drawing to the canvas - we scale the image to fit the canvas
            createImageBitmap(imageData).then((bitmap) => {
                context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
                bitmap.close();
            });
        };
    }, [stateRefresh, canvasRef.current, width, height, scale, Filter, blending, palette]);

    useEffect(() => {
        inputRef.current = newFrame;
        return () => (inputRef.current = undefined);
    }, [inputRef, newFrame]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let currentImage: ImageData | null = null;

        const oldContext = canvas.getContext("2d", { alpha: false });
        if (oldContext) {
            currentImage = oldContext.getImageData(0, 0, canvas.width, canvas.height);
        }

        canvas.width = width * scale * window.devicePixelRatio;
        canvas.height = height * scale * window.devicePixelRatio;
        canvas.style.width = `${width * scale}px`;
        canvas.style.aspectRatio = `${width} / ${height}`;

        if (currentImage) {
            const newContext = canvas.getContext("2d", { alpha: false });
            if (!newContext) return;
            newContext.imageSmoothingEnabled = false;
            // Actual drawing to the canvas - we scale the image to fit the canvas
            createImageBitmap(currentImage).then((bitmap) => {
                newContext.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
            });
        }
    }, [width, height, scale, canvasRef.current]);

    return (
        <div className="screen-container">
            <canvas id={id} ref={canvasRef} />
        </div>
    );
};

export default Screen;
