import { useEffect, useRef } from "preact/hooks";

const useKeys = (codes: string[] = []) => {
    const pressedKeys = useRef<string[]>([]);

    useEffect(() => {
        const codesLower = codes.map((code) => code.toLowerCase());

        const keyDownListener = (e: KeyboardEvent) => {
            if (!codesLower.includes(e.key.toLowerCase())) return;

            var target = (e.target || e.srcElement) as HTMLElement;
            var targetTagName = target === null ? "null" : target.nodeName.toUpperCase();
            if (/INPUT|SELECT|TEXTAREA/.test(targetTagName)) {
                return;
            }

            e.preventDefault();
            const index = pressedKeys.current.indexOf(e.key);
            if (index === -1) {
                pressedKeys.current.push(e.key);
            }
        };
        const keyUpListener = (e: KeyboardEvent) => {
            if (!codesLower.includes(e.key.toLowerCase())) return;

            const index = pressedKeys.current.indexOf(e.key);
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
    }, [codes]);

    return pressedKeys.current;
};

export default useKeys;
