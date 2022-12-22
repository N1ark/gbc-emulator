import { ComponentChildren, FunctionalComponent } from "preact";

type DrawerSectionProps = {
    title: string;
    children: ComponentChildren;
};

const DrawerSection: FunctionalComponent<DrawerSectionProps> = ({ title, children }) => (
    <div>
        <div>{title}</div>
        <div className="drawer-content">{children}</div>
    </div>
);

export default DrawerSection;
