import { ComponentChildren, createContext, FunctionalComponent } from "preact";
import { useCallback, useContext, useState } from "preact/hooks";
import { Identity, ImageFilter } from "./ImageFilter";

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

const ConfigContext = createContext<
    [Configuration, (newConfig: Partial<Configuration>) => void]
>([defaultConfig, () => {}]);

export const useConfig = () => useContext(ConfigContext);

export const ConfigProvider: FunctionalComponent<ComponentChildren> = ({ children }) => {
    const [config, setConfig] = useState<Configuration>(defaultConfig);
    const configUpdater = useCallback(
        (newConfig: Partial<Configuration>) => setConfig((c) => ({ ...c, ...newConfig })),
        [setConfig]
    );
    return (
        <ConfigContext.Provider value={[config, configUpdater]}>
            {children}
        </ConfigContext.Provider>
    );
};
