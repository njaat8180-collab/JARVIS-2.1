// ==========================================
// JARVIS PRO MAX
// Action Registry
// renderer/js/brain/actionRegistry.js
// ==========================================

"use strict";

window.ActionRegistry = {

    // ======================================
    // Apps
    // ======================================

    open_chrome: async () => {

        return await window.jarvis.openChrome();

    },

    open_vscode: async () => {

        return await window.jarvis.openVSCode();

    },

    open_notepad: async () => {

        return await window.jarvis.openNotepad();

    },

    open_calculator: async () => {

        return await window.jarvis.openCalculator();

    },

    open_explorer: async () => {

        return await window.jarvis.openExplorer();

    },

    open_settings: async () => {

        return await window.jarvis.openSettings();

    },

    // ======================================
    // Power
    // ======================================

    shutdown_pc: async () => {

        return await window.jarvis.shutdown();

    },

    restart_pc: async () => {

        return await window.jarvis.restart();

    },

    sleep_pc: async () => {

        return await window.jarvis.sleep();

    },

    lock_pc: async () => {

        return await window.jarvis.lockPC();

    }

};