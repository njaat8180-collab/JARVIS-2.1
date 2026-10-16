"use strict";

/**
 * ============================================================
 * J.A.R.V.I.S — Boot Sequence
 * ============================================================
 * Cinematic startup: J.A.R.V.I.S title flicker, system check
 * lines, loading bar, then fade into the main UI.
 * ============================================================
 */

(function () {

    const BOOT_LINES = [
        "Opening JARVIS",
        "Loading your workspace",
        "Connection and device status appear in Health"
    ];

    function createBootOverlay() {
        const overlay = document.createElement("div");
        overlay.id = "bootOverlay";

        overlay.innerHTML = `
            <div class="boot-title">J.A.R.V.I.S</div>
            <div class="boot-subtitle">JUST A RATHER VERY INTELLIGENT SYSTEM</div>
            <div class="boot-lines" id="bootLines"></div>
            <div class="boot-bar"></div>
        `;

        document.body.appendChild(overlay);
        return overlay;
    }

    function runBoot() {
        const overlay = createBootOverlay();
        const linesContainer = document.getElementById("bootLines");

        let lineIndex = 0;
        const lineDelay = 150;

        function addNextLine() {
            if (lineIndex >= BOOT_LINES.length) {
                // All lines shown — wait then fade out
                setTimeout(finishBoot, 150);
                return;
            }

            const line = document.createElement("div");
            line.className = "boot-line";
            line.textContent = BOOT_LINES[lineIndex];
            linesContainer.appendChild(line);

            // Trigger animation
            requestAnimationFrame(() => {
                line.style.animationDelay = "0s";
            });

            lineIndex++;
            setTimeout(addNextLine, lineDelay);
        }

        // Start after a brief pause
        setTimeout(addNextLine, 100);
    }

    function finishBoot() {
        const overlay = document.getElementById("bootOverlay");
        if (!overlay) return;

        overlay.classList.add("fade-out");

        setTimeout(() => {
            overlay.classList.add("hide");
            // Remove from DOM
            try { overlay.remove(); } catch (_) {}
        }, 250);
    }

    // Start boot when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", runBoot);
    } else {
        runBoot();
    }

})();
