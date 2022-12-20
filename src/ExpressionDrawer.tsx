import { Plus, Trash } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useState } from "preact/hooks";
import "./ExpressionDrawer.css";
import ExpressionWatch from "./ExpressionWatch";

type ExpressionDrawerProps = {
    updater: number;
};

type ExpressionDrawerRowProps = {
    updater: number;
    isRoot?: boolean;
    deleteChild?: () => void;
};

const ExpressionDrawerRow: FunctionalComponent<ExpressionDrawerRowProps> = ({
    updater,
    isRoot,
    deleteChild,
}) => {
    const [hasNext, setHasNext] = useState<boolean>(false);
    return (
        <>
            <ExpressionWatch updater={updater} />
            {hasNext ? (
                <ExpressionDrawerRow updater={updater} deleteChild={() => setHasNext(false)} />
            ) : (
                <>
                    <button
                        title="Delete"
                        className="icon-button"
                        onClick={() => setHasNext(true)}
                    >
                        <Plus />
                    </button>
                    {!isRoot && (
                        <button title="Delete" className="icon-button" onClick={deleteChild}>
                            <Trash />
                        </button>
                    )}
                </>
            )}
        </>
    );
};

const ExpressionDrawer: FunctionalComponent<ExpressionDrawerProps> = ({ updater }) => {
    return (
        <div className="exp-drawer">
            <ExpressionDrawerRow updater={updater} isRoot={true} />
        </div>
    );
};

export default ExpressionDrawer;
