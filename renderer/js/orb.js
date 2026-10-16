// ============================================
// JARVIS 4.0
// AI ORB ENGINE
// renderer/js/orb.js
// ============================================

"use strict";

// ============================================
// Elements
// ============================================

const orb = document.querySelector(".orb");
const rings = document.querySelectorAll(".ring");

// ============================================
// Check
// ============================================

if (!orb) {
    console.error("❌ AI Orb not found.");
}

// ============================================
// Clear All States
// ============================================

function clearStates() {

    if (!orb) return;

    orb.classList.remove(
        "orb-offline",
        "orb-starting",
        "orb-ready",
        "orb-listening",
        "orb-thinking",
        "orb-speaking"
    );

    rings.forEach((ring) => {

        ring.classList.remove(
            "ring-listening",
            "ring-thinking",
            "ring-speaking"
        );

    });

}

// ============================================
// Change Orb State
// ============================================

function setOrb(state) {

    if (!orb) return;

    clearStates();

    document.body.dataset.orbState = state === "ready" ? "idle" : state;

    switch (state) {

        case "offline":

            orb.classList.add("orb-offline");

            break;

        case "starting":

            orb.classList.add("orb-starting");

            break;

        case "ready":

            orb.classList.add("orb-ready");

            break;

        case "listening":

            orb.classList.add("orb-listening");

            rings.forEach(ring => {

                ring.classList.add("ring-listening");

            });

            break;

        case "thinking":

            orb.classList.add("orb-thinking");

            rings.forEach(ring => {

                ring.classList.add("ring-thinking");

            });

            break;

        case "speaking":

            orb.classList.add("orb-speaking");

            rings.forEach(ring => {

                ring.classList.add("ring-speaking");

            });

            break;

        default:

            orb.classList.add("orb-ready");

    }

}

// ============================================
// Helper Functions
// ============================================

function offline() {

    setOrb("offline");

}

function starting() {

    setOrb("starting");

}

function ready() {

    setOrb("ready");

}

function listening() {

    setOrb("listening");

}

function thinking() {

    setOrb("thinking");

}

function speaking() {

    setOrb("speaking");

}

// ============================================
// Export
// ============================================

window.OrbEngine = {

    setOrb,

    offline,

    starting,

    ready,

    listening,

    thinking,

    speaking

};

// ============================================
// Default State
// ============================================

document.addEventListener("DOMContentLoaded", () => {

    ready();

});