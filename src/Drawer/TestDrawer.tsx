import { useSignal } from "@preact/signals";
import { BoxSelect, FileQuestion } from "lucide-preact";
import { Fragment, FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
import GameBoyColor from "../emulator/GameBoyColor";
import GameBoyInput from "../emulator/GameBoyInput";
import GameBoyOutput from "../emulator/GameBoyOutput";
import { testConfig, testFiles } from "../testConfig";

type TestOutput = "❌" | "⌛" | "✅" | "🪦";

type TestFiles = typeof testFiles;
type EntryOf<T> = T[keyof T];
type TestKeys = EntryOf<{ [k in keyof TestFiles]: keyof TestFiles[k] }>;

const makeGameboy = (
    rom: Uint8Array,
    videoOut: (d: Uint32Array) => void,
    serialOut: (s: string) => void,
    errorOut: (e: unknown) => void
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

    const debug = () => ({
        canStep: false,
        skipDebug: true,
        tripleSpeed: true,
    });

    const gbOut: GameBoyOutput = {
        receive: videoOut,
        serialOut: (d) => serialOut(String.fromCharCode(d)),
        errorOut: errorOut,
    };

    return new GameBoyColor(rom, gameIn, gbOut, debug);
};

type TestResult = Record<string, { group: string; state: TestOutput }>;

const runTests = async (validGroups: string[] = [], results: (r: TestResult) => void) => {
    const allTests = Object.entries(testFiles).flatMap(([testType, groups]) =>
        Object.entries(groups).flatMap(([group, tests]) =>
            tests.map((test) => [testType, group, test] as [string, string, string])
        )
    );

    const localResults: TestResult = {};

    for (const [testType, group, fileName] of allTests) {
        if (validGroups.length && !validGroups.includes(`${testType}/${group}`)) continue;

        console.log(`Running test ${testType}/${group} -> ${fileName}`);

        const getTestState = testConfig[testType as keyof typeof testFiles];
        const romResponse = await fetch(`/tests/${testType}/${fileName}.gb`);
        const romBlob = await romResponse.blob();
        const romArray = new Uint8Array(await romBlob.arrayBuffer());

        let videoOut: Uint32Array = new Uint32Array();
        let caughtError: unknown = undefined;
        let serialOut: string = "";
        let state: TestOutput;

        try {
            const gbc = makeGameboy(
                romArray,
                (v) => (videoOut = v),
                (s) => (serialOut += s),
                (e) => (caughtError = e)
            );
            gbc.start();

            while (true) {
                if (caughtError !== undefined) {
                    state = "🪦";
                    break;
                }

                if (gbc["cpu"]["stepCounter"] > 10_000_000) {
                    state = "⌛";
                    break;
                }

                const newState = await getTestState(gbc, serialOut, videoOut);
                if (newState !== null) {
                    state = newState === "failure" ? "❌" : "✅";
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            gbc.stop();
        } catch (e) {
            console.error("Caught error, skipping test", e);
            state = "🪦";
        }

        localResults[fileName] = {
            group: `${testType}/${group}`,
            state,
        };
        results(localResults);
        console.table(localResults);
    }
    console.log(
        `Finished running tests! Passed ${
            Object.values(results).filter((x) => x.state === "✅").length
        }/${Object.keys(results).length}`
    );
};

const testGroups = Object.entries(testFiles).flatMap(([key, groups]) =>
    Object.keys(groups).map((group) => `${key}/${group}`)
);

const localStorageKey = "test-drawer-groups";

const TestDrawer: FunctionalComponent = () => {
    const testsRunning = useSignal<boolean>(false);
    const testResults = useSignal<TestResult>({});
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
            <div className="test-drawer-title">
                <div>Settings:</div>
                <button
                    title="Testing"
                    disabled={testsRunning.value}
                    className="icon-button"
                    onClick={() => {
                        testResults.value = {};
                        testsRunning.value = true;
                        runTests(
                            keptTests.value,
                            (r) => (testResults.value = { ...testResults.value, ...r })
                        ).then(() => (testsRunning.value = false));
                    }}
                >
                    <FileQuestion />
                </button>
                <button
                    title="Select/Unselect All"
                    disabled={testsRunning.value}
                    className="icon-button"
                    onClick={() =>
                        (keptTests.value = keptTests.value.length === 0 ? testGroups : [])
                    }
                >
                    <BoxSelect />
                </button>
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
                    const matchingTests = Object.entries(testResults.value).filter(
                        (v) => v[1].group === group
                    );
                    return (
                        <Fragment key={group}>
                            <label>
                                <span className="group-label">
                                    {group}
                                    {selected && matchingTests.length > 0 && (
                                        <strong>
                                            {
                                                matchingTests.filter((v) => v[1].state === "✅")
                                                    .length
                                            }
                                            /{matchingTests.length}
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
                                matchingTests.map(([testName, { state }]) => (
                                    <div key={testName} className="test-result">
                                        <span className="test-name">{testName}</span>
                                        <span className="test-state">{state}</span>
                                    </div>
                                ))}
                        </Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default TestDrawer;
