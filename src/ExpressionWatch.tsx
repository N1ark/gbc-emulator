import { FunctionalComponent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Register, SubRegister } from "./emulator/Register";

type ExpressionWatchProps = {
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
    return `'${value}'`;
};

const ExpressionWatch: FunctionalComponent<ExpressionWatchProps> = ({ updater }) => {
    const [expression, setExpression] = useState<string>("");
    const [func, setFunction] = useState<Function | null>(null);
    const [output, setOutput] = useState<string | null>(null);

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
                onInput={(e) => {
                    const exp = e.currentTarget.value;
                    e.stopPropagation();
                    setExpression(exp);
                    try {
                        setFunction(() => new Function(`return ${exp}`));
                    } catch {
                        setFunction(null);
                    }
                }}
            />
            <div className={output === null ? "error" : undefined}>
                <input type="text" className="label" placeholder="label" />
                {output === null ? "Error" : output}
            </div>
        </div>
    );
};

export default ExpressionWatch;
