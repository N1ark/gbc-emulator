import { useSignal } from "@preact/signals";
import { FunctionalComponent, JSX } from "preact";
import "./Resizable.css";

export type ResizableProps = JSX.HTMLAttributes<HTMLDivElement> & { initalWidth: number };

export const Resizable: FunctionalComponent<ResizableProps> = ({
    initalWidth,
    children,
    ...rest
}) => {
    const width = useSignal(initalWidth);

    const mouseDownHandler = (e: MouseEvent) => {
        const startX = e.clientX;
        const startWidth = width.value;

        const onMouseMove = (e: MouseEvent) => {
            width.value = startWidth + (e.clientX - startX);
            e.stopPropagation();
        };

        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    return (
        <div {...rest} style={{ minWidth: width.value, maxWidth: width.value }}>
            {children}
            <div className="resizer" onMouseDown={mouseDownHandler} />
        </div>
    );
};
