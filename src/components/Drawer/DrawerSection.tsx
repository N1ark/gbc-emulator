import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-preact";
import { ComponentChildren, FunctionalComponent } from "preact";
import { useEffect, useRef } from "preact/hooks";
import IconButton from "@components/IconButton";

type DrawerSectionProps = {
    title: string;
    children: ComponentChildren;
};

const localStorageKey = "drawer-section-status";

const DrawerSection: FunctionalComponent<DrawerSectionProps> = ({ title, children }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const isOpen = useSignal<boolean>(false);

    const id = `drawer-section-${title.toLowerCase().replace(/ /g, "-")}`;

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
                <IconButton
                    id={id}
                    title="Open/Close Tab"
                    onClick={() => (isOpen.value = !isOpen.value)}
                    Icon={isOpen.value ? ChevronUp : ChevronDown}
                />
            </div>
            <div className="drawer-content">
                {isOpen.value && <div ref={contentRef}>{children}</div>}
            </div>
        </div>
    );
};

export default DrawerSection;
