import { ComponentChildren, createContext, FunctionalComponent } from "preact";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { filterByName, Identity, ImageFilter } from "./ImageFilter";

export type Configuration = {
    scale: 0 | 1 | 2;
    filter: ImageFilter;
    audioEnabled: boolean;
    frameBlending: boolean;
};

const defaultConfig: Configuration = {
    scale: 1,
    filter: Identity,
    audioEnabled: false,
    frameBlending: true,
};

const configToString = (config: Configuration): string =>
    JSON.stringify({
        scale: config.scale,
        filter: config.filter.name,
        frameBlending: config.frameBlending,
    });

const configFromString = (configString: string): Configuration => {
    const rawConfig = JSON.parse(configString);
    // Create a partial config with only objects that are defined and part of the default config
    const loadedConfig: Partial<Configuration> = Object.fromEntries(
        Object.entries({
            filter: filterByName(rawConfig.filter),
            scale: rawConfig.scale,
            frameBlending: rawConfig.frameBlending,
        }).filter(([k, v]) => k in defaultConfig && v !== undefined)
    );
    return { ...defaultConfig, ...loadedConfig };
};

const ConfigContext = createContext<
    [Configuration, (newConfig: Partial<Configuration>) => void]
>([defaultConfig, () => {}]);

export const useConfig = () => useContext(ConfigContext);

const localStorageKey = "config";

export const ConfigProvider: FunctionalComponent<ComponentChildren> = ({ children }) => {
    const [config, setConfig] = useState<Configuration>(defaultConfig);
    const configUpdater = useCallback(
        (newConfig: Partial<Configuration>) => {
            let fullNewConfig: Configuration;
            setConfig((c) => (fullNewConfig = { ...c, ...newConfig }));
            localStorage.setItem(localStorageKey, configToString(fullNewConfig!));
        },
        [setConfig]
    );

    useEffect(() => {
        const savedConfig = localStorage.getItem(localStorageKey);
        if (savedConfig) {
            setConfig(configFromString(savedConfig));
        }
    }, []);

    return (
        <ConfigContext.Provider value={[config, configUpdater]}>
            {children}
        </ConfigContext.Provider>
    );
};
