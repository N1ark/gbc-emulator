import { ComponentChildren, createContext, FunctionalComponent } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";

import { filterByName, Identity, ImageFilter } from "@helpers/ImageFilter";

export type Configuration = {
    scale: 0 | 1 | 2;
    filter: ImageFilter;
    audioEnabled: boolean;
    frameBlending: boolean;
    bootRom: "none" | "real";
    console: "dmg" | "cgb";
    gbPalette: undefined | Partial<Record<number, number>>;
    volume: number;
    showStats: boolean;
    showDebugScreens: boolean;

    bootRomDmg: Uint8Array | null;
    bootRomCgb: Uint8Array | null;

    controlArrowUp: string;
    controlArrowDown: string;
    controlArrowLeft: string;
    controlArrowRight: string;
    controlA: string;
    controlB: string;
    controlStart: string;
    controlSelect: string;
};

type ConfigLoader<T> = {
    to: (v: T) => string;
    from: (v: string) => T;
};

const IdentitySave: ConfigLoader<any> = { to: (v) => v, from: (v) => v };

/** Not very memory efficient, but the sizes of the boot ROMs are small enough that it's acceptable */
const Uint8ArrayStringSave: ConfigLoader<Uint8Array | null> = {
    to: (v) =>
        v === null
            ? "0"
            : Array.from(v)
                  .map((x) => x.toString(16).padStart(2, "0"))
                  .join(""),
    from: (v) =>
        v === "0"
            ? null
            : new Uint8Array(v.length / 2).map((_, i) =>
                  Number.parseInt(v.substring(i * 2, i * 2 + 2), 16)
              ),
};

const configLoaders: {
    [k in keyof Configuration]: null | ConfigLoader<Configuration[k]>;
} = {
    scale: IdentitySave,
    filter: {
        to: (v: ImageFilter) => v.name,
        from: (v: string) => filterByName(v) ?? Identity,
    },
    audioEnabled: null,
    frameBlending: IdentitySave,
    bootRom: IdentitySave,
    console: IdentitySave,
    gbPalette: IdentitySave,
    volume: IdentitySave,
    showStats: IdentitySave,
    showDebugScreens: IdentitySave,

    bootRomDmg: Uint8ArrayStringSave,
    bootRomCgb: Uint8ArrayStringSave,

    controlArrowUp: IdentitySave,
    controlArrowDown: IdentitySave,
    controlArrowLeft: IdentitySave,
    controlArrowRight: IdentitySave,
    controlA: IdentitySave,
    controlB: IdentitySave,
    controlStart: IdentitySave,
    controlSelect: IdentitySave,
};

const defaultConfig: Configuration = {
    scale: 1,
    filter: Identity,
    audioEnabled: false,
    frameBlending: true,
    bootRom: "none",
    console: "dmg",
    gbPalette: undefined,
    volume: 0.5,
    showStats: false,
    showDebugScreens: false,

    bootRomDmg: null,
    bootRomCgb: null,

    controlArrowUp: "ArrowUp",
    controlArrowDown: "ArrowDown",
    controlArrowLeft: "ArrowLeft",
    controlArrowRight: "ArrowRight",
    controlA: "z",
    controlB: "x",
    controlStart: "Enter",
    controlSelect: "Backspace",
};

const configToString = (config: Configuration): string =>
    JSON.stringify(
        Object.fromEntries(
            Object.entries(config) // @ts-ignore
                .filter(([k, v]) => configLoaders[k] !== null) // @ts-ignore
                .map(([k, v]) => [k, configLoaders[k].to(v)])
        )
    );

const configFromString = (configString: string): Configuration => {
    const rawConfig = JSON.parse(configString);
    // Create a partial config with only objects that are defined and part of the default config
    const loadedConfig: Partial<Configuration> = Object.fromEntries(
        Object.entries(rawConfig)
            .filter(([k, v]) => k in configLoaders && v !== undefined) // @ts-ignore
            .map(([k, v]) => [k, configLoaders[k].from(v)])
    );
    return { ...defaultConfig, ...loadedConfig };
};

const ConfigContext = createContext<
    [Configuration, (newConfig: Partial<Configuration>) => void]
>([defaultConfig, () => {}]);

export const useConfig = () => useContext(ConfigContext);

const localStorageKey = "config";

export const ConfigProvider: FunctionalComponent<ComponentChildren> = ({ children }) => {
    const [config, setConfig] = useState<Configuration>(() => {
        const savedConfig = localStorage.getItem(localStorageKey);
        if (savedConfig) {
            const config = configFromString(savedConfig);
            return { ...defaultConfig, ...config };
        }
        return defaultConfig;
    });
    const configUpdater = useCallback(
        (newConfig: Partial<Configuration>) => {
            let fullNewConfig: Configuration;
            setConfig((c) => (fullNewConfig = { ...c, ...newConfig }));
            localStorage.setItem(localStorageKey, configToString(fullNewConfig!));
        },
        [setConfig]
    );

    return (
        <ConfigContext.Provider value={[config, configUpdater]}>
            {children}
        </ConfigContext.Provider>
    );
};
