import { createRef } from "preact";
import { useEffect } from "preact/hooks";

const useKeys = () => {
    const pressedKeys = createRef<string[]>();
    pressedKeys.current = [];

    useEffect(() => {
        const keyDownListener = (e: KeyboardEvent) => {
            if (pressedKeys.current === null) return;

            const key = e.key.toLowerCase();
            const index = pressedKeys.current.indexOf(key);
            if (index === -1) {
                pressedKeys.current.push(key);
            }
        };
        const keyUpListener = (e: KeyboardEvent) => {
            if (pressedKeys.current === null) return;

            const key = e.key.toLowerCase();
            const index = pressedKeys.current.indexOf(key);
            if (index !== -1) {
                pressedKeys.current.splice(index, 1);
            }
        };

        document.addEventListener("keydown", keyDownListener);
        document.addEventListener("keyup", keyUpListener);

        return () => {
            document.removeEventListener("keydown", keyDownListener);
            document.removeEventListener("keyup", keyUpListener);
        };
    }, []);

    return pressedKeys.current;
};

export default useKeys;
