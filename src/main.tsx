import { render } from "preact";
import App from "@/app";
import "@/index.css";
import { ConfigProvider } from "./helpers/ConfigContext";

render(
    <ConfigProvider>
        <App />
    </ConfigProvider>,
    document.getElementById("app") as HTMLElement
);
