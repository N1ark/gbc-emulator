import { createRef } from "preact";
import { useEffect, useRef } from "preact/hooks";

const useKeys = (codes: string[] = []) => {
    const pressedKeys = useRef<string[]>([]);

    useEffect(() => {
        const keyDownListener = (e: KeyboardEvent) => {
            if (!codes.includes(e.key.toLowerCase())) return;

            var target = (e.target || e.srcElement) as HTMLElement;
            var targetTagName = target === null ? "null" : target.nodeName.toUpperCase();
            if (/INPUT|SELECT|TEXTAREA/.test(targetTagName)) {
                return;
            }

            e.preventDefault();
            const key = e.key.toLowerCase();
            const index = pressedKeys.current.indexOf(key);
            if (index === -1) {
                pressedKeys.current.push(key);
            }
        };
        const keyUpListener = (e: KeyboardEvent) => {
            if (!codes.includes(e.key.toLowerCase())) return;

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
