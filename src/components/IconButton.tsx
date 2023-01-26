import { LucideProps } from "lucide-preact";
import { FunctionalComponent, JSX } from "preact";

type IconButtonProps = {
    id?: string;
    title: string;
    Icon: (props: LucideProps) => JSX.Element;
    toggled?: boolean;
    disabled?: boolean;
    onClick?: () => void;
};

const IconButton: FunctionalComponent<IconButtonProps> = ({
    id,
    title,
    Icon,
    toggled,
    disabled,
    onClick,
}) => {
    return (
        <button
            title={title}
            className={`icon-button ${toggled ? "toggled" : ""}`}
            onClick={onClick}
            disabled={disabled}
            id={id}
        >
            <Icon />
        </button>
    );
};

export default IconButton;
