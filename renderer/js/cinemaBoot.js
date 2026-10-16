"use strict";

(function () {
    async function run() {
        const host = document.getElementById("cinemaBootStatus");
        try {
            const result = await globalThis.JARVISBootHealth?.runBootSequence?.();
            if (!result) return;
            if (host) {
                host.textContent = result.ready ? "ALL SYSTEMS ... ONLINE" : "DEGRADED MODE";
                host.classList.toggle("cinema-boot-warn", !result.ready);
                host.title = result.criticalFailures.length
                    ? `Critical checks failed: ${result.criticalFailures.join(", ")}`
                    : "All critical health checks passed";
            }
        } catch (error) {
            if (host) {
                host.textContent = "DEGRADED MODE";
                host.classList.add("cinema-boot-warn");
            }
            console.warn("[CinemaBoot] health check failed:", error);
        }
    }
    document.addEventListener("DOMContentLoaded", run);
})();
