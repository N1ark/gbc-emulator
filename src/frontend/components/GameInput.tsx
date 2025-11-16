import { FunctionalComponent } from "preact";
import { useEffect, useMemo } from "preact/hooks";

import GameBoyInput from "@emulator/GameBoyInput";
import { useConfig } from "@helpers/ConfigContext";
import useKeys from "@helpers/useKeys";

import "./GameInput.css";

type GameBoyInputObj = ReturnType<GameBoyInput["read"]>;

type JoypadButtonProps = {
    name: string;
    objKey: keyof GameBoyInputObj;
    obj: GameBoyInputObj;
};

const JoypadButton: FunctionalComponent<JoypadButtonProps> = ({ name, objKey, obj }) => {
    return (
        <button
            className={`control-button btn-${objKey}`}
            onTouchStart={(e) => {
                obj[objKey] = true;
                if (e.cancelable) e.preventDefault();
            }}
            onTouchEnd={(e) => {
                obj[objKey] = false;
                if (e.cancelable) e.preventDefault();
            }}
        >
            {name}
        </button>
    );
};

const NO_INPUT: GameBoyInputObj = {
    a: false,
    b: false,
    start: false,
    select: false,
    up: false,
    down: false,
    left: false,
    right: false,
};

type GameInputProps = {
    inputHandler: (input: GameBoyInput) => void;
};

const GameInput: FunctionalComponent<GameInputProps> = ({ inputHandler }) => {
    const [
        {
            controlA,
            controlB,
            controlStart,
            controlSelect,
            controlArrowUp,
            controlArrowDown,
            controlArrowLeft,
            controlArrowRight,
        },
    ] = useConfig();

    const pressedKeys = useKeys([
        controlA,
        controlB,
        controlStart,
        controlSelect,
        controlArrowUp,
        controlArrowDown,
        controlArrowLeft,
        controlArrowRight,
    ]);

    const touchControlStatus = useMemo(() => ({ ...NO_INPUT }), []);

    const inputFn = useMemo(() => {
        const obj = { ...NO_INPUT };
        return () => {
            obj.a = touchControlStatus.a || pressedKeys.includes(controlA);
            obj.b = touchControlStatus.b || pressedKeys.includes(controlB);
            obj.start = touchControlStatus.start || pressedKeys.includes(controlStart);
            obj.select = touchControlStatus.select || pressedKeys.includes(controlSelect);
            obj.up = touchControlStatus.up || pressedKeys.includes(controlArrowUp);
            obj.down = touchControlStatus.down || pressedKeys.includes(controlArrowDown);
            obj.left = touchControlStatus.left || pressedKeys.includes(controlArrowLeft);
            obj.right = touchControlStatus.right || pressedKeys.includes(controlArrowRight);
            return obj;
        };
    }, [
        touchControlStatus,
        pressedKeys,
        controlA,
        controlB,
        controlStart,
        controlSelect,
        controlArrowUp,
        controlArrowDown,
        controlArrowLeft,
        controlArrowRight,
    ]);

    useEffect(() => {
        inputHandler({ read: inputFn });
    }, [inputFn]);

    return (
        <div className="mobile-only joypad-input">
            <div className="arrow-buttons">
                <JoypadButton name="↑" objKey="up" obj={touchControlStatus} />
                <JoypadButton name="←" objKey="left" obj={touchControlStatus} />
                <JoypadButton name="→" objKey="right" obj={touchControlStatus} />
                <JoypadButton name="↓" objKey="down" obj={touchControlStatus} />
            </div>
            <div className="main-buttons">
                <JoypadButton name="A" objKey="a" obj={touchControlStatus} />
                <JoypadButton name="B" objKey="b" obj={touchControlStatus} />
                <JoypadButton name="START" objKey="start" obj={touchControlStatus} />
                <JoypadButton name="SELECT" objKey="select" obj={touchControlStatus} />
            </div>
        </div>
    );
};

export default GameInput;
