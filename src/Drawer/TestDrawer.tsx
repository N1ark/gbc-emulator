import { useSignal } from "@preact/signals";
import { BoxSelect, FileQuestion } from "lucide-preact";
import { Fragment, FunctionalComponent } from "preact";
import { useEffect } from "preact/hooks";
import GameBoyColor from "../emulator/GameBoyColor";
import GameBoyInput from "../emulator/GameBoyInput";
import GameBoyOutput from "../emulator/GameBoyOutput";
import IconButton from "../IconButton";
import { testConfig, testFiles } from "../testConfig";

type TestOutput = "❌" | "⌛" | "✅" | "🪦";

type TestFiles = typeof testFiles;
type EntryOf<T> = T[keyof T];

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

const loadTestRom = async (testType: string, fileName: string) => {
    const romResponse = await fetch(`/tests/${testType}/${fileName}.gb`);
    const romBlob = await romResponse.blob();
    return new Uint8Array(await romBlob.arrayBuffer());
};

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
        const romArray = await loadTestRom(testType, fileName);

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

                const newState = await getTestState(gbc, serialOut, videoOut, fileName);
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

type TestDrawerProps = {
    loadRom: (rom: Uint8Array) => void;
};

const TestDrawer: FunctionalComponent<TestDrawerProps> = ({ loadRom }) => {
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
            <div className="drawer-section-title">
                <div>Settings:</div>
                <IconButton
                    title="Testing"
                    Icon={FileQuestion}
                    disabled={testsRunning.value}
                    onClick={() => {
                        testResults.value = {};
                        testsRunning.value = true;
                        runTests(
                            keptTests.value,
                            (r) => (testResults.value = { ...testResults.value, ...r })
                        ).then(() => (testsRunning.value = false));
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
                                    <button
                                        key={testName}
                                        className="test-result"
                                        onClick={() =>
                                            loadTestRom(group.split("/")[0], testName).then(
                                                loadRom
                                            )
                                        }
                                    >
                                        <span className="test-name">{testName}</span>
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
