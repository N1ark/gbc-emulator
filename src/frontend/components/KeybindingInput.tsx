import { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import "./KeybindingInput.css";

type KeybindingInputProps = {
    value: string;
    onChange: (value: string) => void;
};

const KEY_DISPLAY: Record<string, string | undefined> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Meta: "⌘",
    " ": "Space",
};

const KeybindingInput: FunctionalComponent<KeybindingInputProps> = ({ value, onChange }) => {
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [key, setKey] = useState<string | undefined>(undefined);

    const ref = useRef<HTMLButtonElement>(null);

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsEditing(false);
                ref.current?.blur();
                return;
            }
            if (e.key === "Enter" && key) {
                setIsEditing(false);
                onChange(key);
                ref.current?.blur();
                return;
            }

            setKey(e.key);
            e.stopPropagation();
            e.preventDefault();
        },
        [setIsEditing, onChange, setKey, key]
    );

    useEffect(() => {
        if (isEditing) {
            document.addEventListener("keydown", onKeyDown);
        }
        return () => {
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isEditing, onKeyDown]);

    return (
        <button
            ref={ref}
            className={`keybinding-input ${isEditing ? "editing" : ""}`}
            onClick={() => {
                setIsEditing(true);
                setKey(undefined);
            }}
            onBlur={() => {
                setIsEditing(false);
            }}
        >
            {isEditing
                ? key
                    ? KEY_DISPLAY[key] ?? key
                    : "Press a key"
                : KEY_DISPLAY[value] ?? value}
        </button>
    );
};

export default KeybindingInput;
