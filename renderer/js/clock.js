// ============================================
// JARVIS 4.0
// Digital Clock Engine
// renderer/js/clock.js
// ============================================

"use strict";

console.log("✅ clock.js loaded");

// ============================================
// Elements
// ============================================

const clockElement = document.getElementById("clock");
const dateElement = document.getElementById("date");

// ============================================
// Update Clock
// ============================================

function updateClock() {

    if (!clockElement || !dateElement) return;

    const now = new Date();

    const time = now.toLocaleTimeString("en-US", {

        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true

    });

    const date = now.toLocaleDateString("en-US", {

        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"

    });

    clockElement.textContent = time;
    dateElement.textContent = date;

}

// ============================================
// Start Clock
// ============================================

function startClock() {

    updateClock();

    setInterval(updateClock, 1000);

    console.log("✅ Digital Clock Started");

}

// ============================================
// Auto Start
// ============================================

document.addEventListener("DOMContentLoaded", () => {

    startClock();

});

// ============================================
// Export
// ============================================

window.ClockEngine = {

    startClock,
    updateClock

};