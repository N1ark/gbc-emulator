import { FunctionalComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

type ExpressionWatchProps = {
    expression: string;
    onChange: (expression: string) => void;
    label: string;
    onLabelChange: (label: string) => void;
    updater: number;
};

const handleValue = (
    value: Object | { get: () => number } | number | string | null
): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    if (typeof value === "object" && "get" in value) value = value.get.call(value);

    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "number") return `0x${value.toString(16).padStart(4, "0")}`;
    return value.toString();
};

const ExpressionWatch: FunctionalComponent<ExpressionWatchProps> = ({
    expression,
    onChange,
    label,
    onLabelChange,
    updater,
}) => {
    const [func, setFunction] = useState<Function | null>(null);
    const [output, setOutput] = useState<string | null>(null);

    useEffect(() => {
        try {
            setFunction(() => new Function(`return ${expression}`));
        } catch {
            setFunction(null);
        }
    }, [expression]);

    useEffect(() => {
        let value: typeof output;
        try {
            if (func === null) value = null;
            else value = handleValue(func());
        } catch {
            value = null;
        }
        setOutput(value);
    }, [updater, func]);

    return (
        <div className="exp-watch">
            <textarea
                placeholder="gbc.cpu.regAF"
                spellCheck={false}
                value={expression}
                onInput={(e) => onChange(e.currentTarget.value)}
            />
            <div className={output === null ? "error" : undefined}>
                <input
                    placeholder="label"
                    type="text"
                    className="label"
                    value={label}
                    onInput={(e) => onLabelChange(e.currentTarget.value)}
                />
                <span style={{ display: "inline-block" }}>
                    {output === null ? "Error" : output}
                </span>
            </div>
        </div>
    );
};

export default ExpressionWatch;
