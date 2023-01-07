import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronUp } from "lucide-preact";
import { ComponentChildren, FunctionalComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";

type DrawerSectionProps = {
    title: string;
    children: ComponentChildren;
};

const localStorageKey = "drawer-section-status";

const DrawerSection: FunctionalComponent<DrawerSectionProps> = ({ title, children }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const isOpen = useSignal<boolean>(false);

    useEffect(() => {
        isOpen.value = localStorage.getItem(`${localStorageKey}-${title}`) === "1";
    }, []);
    useEffect(() => {
        localStorage.setItem(`${localStorageKey}-${title}`, isOpen.value ? "1" : "0");
    }, [isOpen.value]);

    return (
        <div className="drawer-section">
            <div className="drawer-title">
                <h3>{title}</h3>
                <button className="icon-button" onClick={() => (isOpen.value = !isOpen.value)}>
                    {isOpen.value ? <ChevronDown /> : <ChevronUp />}
                </button>
            </div>
            <div className="drawer-content">
                {isOpen.value && <div ref={contentRef}>{children}</div>}
            </div>
        </div>
    );
};

export default DrawerSection;
