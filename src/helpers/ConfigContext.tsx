import { ComponentChildren, createContext, FunctionalComponent } from "preact";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { filterByName, Identity, ImageFilter } from "./ImageFilter";

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

    controlArrowUp: string;
    controlArrowDown: string;
    controlArrowLeft: string;
    controlArrowRight: string;
    controlA: string;
    controlB: string;
    controlStart: string;
    controlSelect: string;
};

const IdentitySave = { to: (v: any) => v, from: (v: any) => v };

const configLoaders: {
    [k in keyof Configuration]: null | {
        to: (v: Configuration[k]) => string;
        from: (v: string) => Configuration[k];
    };
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
