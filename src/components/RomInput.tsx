import { FunctionalComponent } from "preact";
import { useRef } from "preact/hooks";
import { JSXInternal } from "preact/src/jsx";

type RomInputProps = {
    onLoad: (data: ArrayBuffer) => void;
};

const RomInput: FunctionalComponent<RomInputProps> = ({ onLoad }) => {
    const fileInput = useRef<HTMLInputElement>(null);

    const romClick = () => {
        fileInput.current?.click();
    };

    const romChange: JSXInternal.GenericEventHandler<HTMLInputElement> = (e) => {
        if (!e.currentTarget.files?.length) return;
        const uploadedRom = e.currentTarget.files[0];
        const reader = new FileReader();
        reader.readAsArrayBuffer(uploadedRom);
        reader.onload = (e) => {
            if (e.target?.result && typeof e.target.result === "object") {
                onLoad(e.target.result);
            }
        };
        console.log("Uploaded rom", uploadedRom);
    };

    return (
        <>
            <button onClick={romClick}>Import a ROM</button>

            <input
                type="file"
                accept=".gb,.gbc"
                ref={fileInput}
                onChange={romChange}
                style={{ display: "none" }}
            />
        </>
    );
};

export default RomInput;
