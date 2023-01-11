import { LucideProps } from "lucide-preact";
import { ComponentType, h, toChildArray } from "preact";
import { JSX } from "preact/jsx-runtime";

const defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
};

type IconNode = [elementName: keyof JSX.IntrinsicElements, attrs: Record<string, string>][];

export const toKebabCase = (string: string) =>
    string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Taken from Preact library directly:
 * @link https://github.com/lucide-icons/lucide/blob/main/packages/lucide-preact/src/createPreactComponent.ts
 */
const createPreactComponent = (iconName: string, iconNode: IconNode) => {
    const Component = ({
        color = "currentColor",
        size = 24,
        strokeWidth = 2,
        children,
        ref, // ignore ref
        ...rest
    }: LucideProps) =>
        h(
            "svg" as unknown as ComponentType<
                Partial<JSX.SVGAttributes<SVGElement> & { "stroke-width": number | string }>
            >,
            {
                ...defaultAttributes,
                width: String(size),
                height: size,
                stroke: color,
                "stroke-width": strokeWidth,
                class: `lucide lucide-${toKebabCase(iconName)}`,
                ...rest,
            },
            [...iconNode.map(([tag, attrs]) => h(tag, attrs)), ...toChildArray(children)]
        );

    Component.displayName = `${iconName}`;

    return Component;
};
const Grid2x = createPreactComponent("Grid2x", [
    [
        "rect",
        {
            x: "3",
            y: "3",
            width: "18",
            height: "18",
            rx: "2",
            ry: "2",
            key: "maln0c",
        },
    ],
    [
        "line",
        {
            x1: "3",
            y1: "12",
            x2: "21",
            y2: "12",
            key: "1uch6j",
        },
    ],
    [
        "line",
        {
            x1: "12",
            y1: "3",
            x2: "12",
            y2: "21",
            key: "nvcl17",
        },
    ],
]);

export default Grid2x;
