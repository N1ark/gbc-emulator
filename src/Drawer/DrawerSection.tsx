import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronUp } from "lucide-preact";
import { ComponentChildren, FunctionalComponent } from "preact";
import { useRef } from "preact/hooks";

type DrawerSectionProps = {
    title: string;
    children: ComponentChildren;
};

const DrawerSection: FunctionalComponent<DrawerSectionProps> = ({ title, children }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const isOpen = useSignal<boolean>(false);

    return (
        <div className="drawer-section">
            <div className="drawer-title">
                <h3>{title}</h3>
                <button className="icon-button" onClick={() => (isOpen.value = !isOpen.value)}>
                    {isOpen.value ? <ChevronDown /> : <ChevronUp />}
                </button>
            </div>
            <div
                className="drawer-content"
                ref={contentRef}
                style={{ maxHeight: isOpen.value ? contentRef.current?.scrollHeight : 0 }}
            >
                <div>{children}</div>
            </div>
        </div>
    );
};

export default DrawerSection;
