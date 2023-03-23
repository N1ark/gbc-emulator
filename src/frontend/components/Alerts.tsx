import { FunctionalComponent } from "preact";
import { useEffect, useState } from "preact/hooks";

import "./Alerts.css";

type Alert = {
    id: number;
    text: string;
    endTime: Date;
    state: "new" | "visible" | "fading";
    fade: number;
};

const alerts: Alert[] = [];
let keyId: number = 0;

function addAlert(text: string, duration: number = 3) {
    alerts.push({
        id: keyId++,
        text,
        endTime: new Date(Date.now() + duration * 1000),
        state: "new",
        fade: 0,
    });
}

const AlertManager: FunctionalComponent = () => {
    const [refresh, setRefresh] = useState<number>(0);

    useEffect(() => {
        const interval = setInterval(() => {
            let changed = false;
            const now = Date.now();
            for (const alert of alerts) {
                if (alert.state === "new") {
                    alert.state = "visible";
                    changed = true;
                }
                if (alert.endTime.getTime() < now) {
                    if (alert.state === "visible") {
                        alert.state = "fading";
                        changed = true;
                    } else {
                        alert.fade++;
                        if (alert.fade > 5) {
                            alerts.splice(alerts.indexOf(alert), 1);
                            changed = true;
                        }
                    }
                }
            }
            if (changed) setRefresh((r) => r + 1);
        }, 100);
        return () => clearInterval(interval);
    }, [setRefresh]);

    return (
        <div id="alert-box">
            {alerts.map((alert) => (
                <div key={alert.id} className={`alert ${alert.state} ${alert.id}`}>
                    {alert.text}
                </div>
            ))}
        </div>
    );
};

export { addAlert, AlertManager };
