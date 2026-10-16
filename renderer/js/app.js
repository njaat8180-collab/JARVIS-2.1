"use strict";

/*
====================================================
JARVIS PRO MAX
app.js
V10 REPAIRED
Application Bootstrap
====================================================
*/

class JARVISApp {

    constructor() {

        this.started = false;

        this.version = "PRO MAX V10";

    }

    async start() {

        try {

            console.log("🚀 Starting JARVIS...");

            // Renderer
            if (window.Renderer) {

                window.Renderer.start();

            }

            // Chat Engine
            if (window.ChatEngine &&
                typeof window.ChatEngine.boot === "function") {

                await window.ChatEngine.boot();

            }

            this.started = true;

            console.log("✅ JARVIS Started");

        }

        catch (error) {

            console.error(

                "App Start Error:",

                error

            );

        }

    }

// =====================================================
// SYSTEM EVENTS
// =====================================================

bindEvents() {

    window.addEventListener("online", () => {

        console.log("🌐 Internet Connected");

        if (window.Renderer) {

            window.Renderer.setInternetStatus("ONLINE");

        }

    });

    window.addEventListener("offline", () => {

        console.log("❌ Internet Disconnected");

        if (window.Renderer) {

            window.Renderer.setInternetStatus("OFFLINE");

        }

    });

}

// =====================================================
// ERROR HANDLER
// =====================================================

registerErrorHandler() {

    window.addEventListener("error", (event) => {

        console.error(
            "Application Error:",
            event.error
        );

    });

    window.addEventListener("unhandledrejection", (event) => {

        console.error(
            "Unhandled Promise:",
            event.reason
        );

    });

}

// =====================================================
// BOOT
// =====================================================

async boot() {

    this.bindEvents();

    this.registerErrorHandler();

    await this.start();

}

// =====================================================
// GLOBAL EXPORT
// =====================================================

}

const App = new JARVISApp();

window.JARVISApp = App;

// =====================================================
// AUTO START
// =====================================================

window.addEventListener("DOMContentLoaded", async () => {

    await App.boot();

    console.log("🧠 JARVIS PRO MAX Ready");

});