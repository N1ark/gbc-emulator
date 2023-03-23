import { useSignal } from "@preact/signals";
import { BoxSelect, FileQuestion } from "lucide-preact";
import { Fragment, FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";

import GameBoyColor from "@emulator/GameBoyColor";
import GameBoyInput from "@emulator/GameBoyInput";
import GameBoyOutput from "@emulator/GameBoyOutput";

import IconButton from "@components/IconButton";
import tests, { Test } from "@frontend/testConfig";

type TestOutput = "❌" | "⌛" | "✅" | "🪦";

const makeGameboy = (
    type: "DMG" | "CGB",
    rom: Uint8Array,
    videoOut: (d: Uint32Array) => void,
    serialOut: (s: string) => void
) => {
    const gameIn: GameBoyInput = {
        read: () => ({
            up: false,
            down: false,
            left: false,
            right: false,
            a: false,
            b: false,
            start: false,
            select: false,
        }),
    };

    const gbOut: GameBoyOutput = {
        receive: videoOut,
        serialOut: (d) => serialOut(String.fromCharCode(d)),
    };

    return new GameBoyColor(type, rom, gameIn, gbOut);
};

type TestResult = [Test, TestOutput][];

const loadTestRom = async (testType: string, fileName: string) => {
    const romResponse = await fetch(`/tests/${testType}/${fileName}.gb`);
    const romBlob = await romResponse.blob();
    return new Uint8Array(await romBlob.arrayBuffer());
};

const runTests = async (validGroups: string[] = [], results: (r: TestResult) => void) => {
    const localResults: TestResult = [];

    for (const test of tests) {
        const { testType, subTestType, file, consoleType, check } = test;
        if (!validGroups.includes(`${testType}/${subTestType}`)) continue;

        console.log(`Running test ${testType}/${subTestType} -> ${file}`);

        const romArray = await loadTestRom(testType, file);

        let videoOut: Uint32Array = new Uint32Array(160 * 144);
        let serialOut: string = "";
        let state: TestOutput;

        try {
            const gbc = makeGameboy(
                consoleType,
                romArray,
                (v) => videoOut.set(v),
                (s) => (serialOut += s)
            );

            let prevSteps = 0;
            while (true) {
                gbc.drawFrame();

                const newState = await check(gbc, serialOut, videoOut, file);
                if (newState !== null) {
                    state = newState === "failure" ? "❌" : "✅";
                    break;
                }

                const steps = gbc["cpu"]["stepCounter"];
                if (steps > 10_000_000 || steps === prevSteps) {
                    state = "⌛";
                    break;
                }
                prevSteps = steps;
            }
        } catch (e) {
            console.error("Caught error, skipping test", e);
            state = "🪦";
        }

        localResults.push([test, state]);
        results(localResults);
    }

    const passedTests = localResults.filter((t) => t[1] === "✅").length;
    const totalTests = localResults.length;
    console.log(`Finished running tests! Passed ${passedTests}/${totalTests} tests.`);
};

const testGroups = tests
    .map((t) => `${t.testType}/${t.subTestType}`)
    .filter((v, i, a) => a.indexOf(v) === i); // Unique

const localStorageKey = "test-drawer-groups";

type TestDrawerProps = {
    loadRom: (rom: Uint8Array) => void;
};

const TestDrawer: FunctionalComponent<TestDrawerProps> = ({ loadRom }) => {
    const testsRunning = useSignal<boolean>(false);
    const testResults = useSignal<TestResult>([]);
    const keptTests = useSignal<string[]>(testGroups);

    // Loading
    useEffect(
        () => (keptTests.value = JSON.parse(localStorage.getItem(localStorageKey) ?? "[]")),
        []
    );
    // Saving
    useEffect(
        () => localStorage.setItem(localStorageKey, JSON.stringify(keptTests.value)),
        [keptTests.value]
    );

    return (
        <div className="test-drawer">
            <div className="drawer-section-title">
                <div>Settings:</div>
                <IconButton
                    title="Testing"
                    Icon={FileQuestion}
                    disabled={testsRunning.value}
                    onClick={() => {
                        testResults.value = [];
                        testsRunning.value = true;
                        runTests(keptTests.value, (r) => (testResults.value = [...r])).then(
                            () => (testsRunning.value = false)
                        );
                    }}
                />
                <IconButton
                    title="Select/Unselect All"
                    Icon={BoxSelect}
                    disabled={testsRunning.value}
                    onClick={() =>
                        (keptTests.value = keptTests.value.length === 0 ? testGroups : [])
                    }
                />
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                }}
            >
                {testGroups.map((group) => {
                    const selected = keptTests.value.includes(group);
                    const matchingTests = tests
                        .filter((t) => `${t.testType}/${t.subTestType}` === group)
                        .map(
                            (t) => [t, testResults.value.find((r) => r[0] === t)?.[1]] as const
                        );

                    const passedTests = matchingTests.filter((v) => v[1] === "✅").length;
                    const totalTests = matchingTests.length;

                    return (
                        <Fragment key={group}>
                            <label>
                                <span className="group-label">
                                    {group}
                                    {selected && matchingTests.length > 0 && (
                                        <strong>
                                            {passedTests}/{totalTests}
                                        </strong>
                                    )}
                                </span>
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={testsRunning.value}
                                    onChange={(e) =>
                                        (keptTests.value = e.currentTarget.checked
                                            ? [...keptTests.value, group]
                                            : keptTests.value.filter((v) => v !== group))
                                    }
                                />
                            </label>
                            {selected &&
                                matchingTests.map(([test, state]) => (
                                    <button
                                        key={test.file}
                                        className="test-result"
                                        onClick={() =>
                                            loadTestRom(test.testType, test.file).then(loadRom)
                                        }
                                    >
                                        <span className="test-name">{test.file}</span>
                                        <span className="test-state">{state}</span>
                                    </button>
                                ))}
                        </Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default TestDrawer;
