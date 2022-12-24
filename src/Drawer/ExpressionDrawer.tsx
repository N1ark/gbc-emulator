import { useSignal } from "@preact/signals";
import { Plus, Trash } from "lucide-preact";
import { FunctionalComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import ExpressionWatch from "./ExpressionWatch";

type ExpressionDrawerProps = {
    updater: number;
};

const localStorageKey = "exp-drawer-list";

const ExpressionDrawer: FunctionalComponent<ExpressionDrawerProps> = ({ updater }) => {
    const expressionList = useSignal<[string, string][]>([]);
    useEffect(
        () =>
            (expressionList.value = JSON.parse(localStorage.getItem(localStorageKey) ?? "[]")),
        []
    );
    const saveToLocalStorage = () =>
        localStorage.setItem(localStorageKey, JSON.stringify(expressionList.value));
    return (
        <div className="exp-drawer">
            {expressionList.value.map(([exp, label], i) => (
                <ExpressionWatch
                    key={i}
                    expression={exp}
                    onChange={(e) => {
                        expressionList.value[i][0] = e;
                        saveToLocalStorage();
                    }}
                    label={label}
                    onLabelChange={(l) => {
                        expressionList.value[i][1] = l;
                        saveToLocalStorage();
                    }}
                    updater={updater}
                />
            ))}
            <button
                title="Add"
                className="icon-button"
                onClick={() => (expressionList.value = [...expressionList.value, ["", ""]])}
            >
                <Plus />
            </button>
            {expressionList.value.length > 0 && (
                <button
                    title="Delete"
                    className="icon-button"
                    onClick={() => (expressionList.value = expressionList.value.slice(0, -1))}
                >
                    <Trash />
                </button>
            )}
        </div>
    );
};

export default ExpressionDrawer;
