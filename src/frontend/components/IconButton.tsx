import { LucideProps } from "lucide-preact";
import { FunctionalComponent, JSX } from "preact";

type IconButtonProps = {
    id?: string;
    title: string;
    Icon: (props: LucideProps) => JSX.Element;
    toggled?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    showTooltip?: boolean;
};

const IconButton: FunctionalComponent<IconButtonProps> = ({
    id,
    title,
    Icon,
    toggled,
    disabled,
    onClick,
    showTooltip,
}) => {
    return (
        <button
            title={title}
            className={`icon-button ${toggled ? "toggled" : ""}`}
            onClick={onClick}
            disabled={disabled}
            id={id}
        >
            {showTooltip && <div className="tooltip">{title}</div>}
            <Icon />
        </button>
    );
};

export default IconButton;
