import { render } from "preact";

import App from "@frontend/app";
import { ConfigProvider } from "@helpers/ConfigContext";

import "@frontend/index.css";
import "@frontend/mobile.css";

render(
    <ConfigProvider>
        <App />
    </ConfigProvider>,
    document.getElementById("app") as HTMLElement
);
