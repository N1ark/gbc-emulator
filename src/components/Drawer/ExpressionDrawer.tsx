import IconButton from "@components/IconButton";
import { useSignal } from "@preact/signals";
import { Plus, Trash } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import ExpressionWatch from "./ExpressionWatch";

const localStorageKey = "exp-drawer-list";

const ExpressionDrawer: FunctionalComponent = () => {
    const refresh = useState(0)[1];
    const expressionList = useSignal<[string, string][]>([]);
    useEffect(
        () =>
            (expressionList.value = JSON.parse(localStorage.getItem(localStorageKey) ?? "[]")),
        []
    );
    const saveToLocalStorage = () =>
        localStorage.setItem(localStorageKey, JSON.stringify(expressionList.value));
    useEffect(saveToLocalStorage, [expressionList.value]);

    return (
        <div className="exp-drawer">
            {expressionList.value.map(([exp, label], i) => (
                <ExpressionWatch
                    key={i}
                    expression={exp}
                    onChange={(e) => {
                        expressionList.value[i][0] = e;
                        saveToLocalStorage();
                        refresh((r) => r + 1);
                    }}
                    label={label}
                    onLabelChange={(l) => {
                        expressionList.value[i][1] = l;
                        saveToLocalStorage();
                        refresh((r) => r + 1);
                    }}
                />
            ))}
            <div className="drawer-section-title">
                <div>Add/Remove:</div>
                <IconButton
                    title="Add"
                    Icon={Plus}
                    onClick={() => (expressionList.value = [...expressionList.value, ["", ""]])}
                />
                {expressionList.value.length > 0 && (
                    <IconButton
                        title="Delete"
                        Icon={Trash}
                        onClick={() =>
                            (expressionList.value = expressionList.value.slice(0, -1))
                        }
                    />
                )}
            </div>
        </div>
    );
};

export default ExpressionDrawer;
