"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createPptxBuffer, verifyPptxBuffer } = require("../src/presentation/pptxGenerator");

const slides = [
    { title: "JARVIS User Guide", points: ["Voice-first AI assistant for Windows", "Use natural English, Hindi or Hinglish commands", "Built for reliable, explainable workflows"], layout: "takeaway", callout: "Speak naturally. JARVIS plans, acts and verifies." },
    { title: "Getting Started", points: ["Launch JARVIS and complete the health or preflight check", "Keep Sarvam AI available for cloud intelligence and Ollama ready as local fallback", "For Computer Use, share the full desktop only when you want screen control"] },
    { title: "Voice and Chat Commands", points: ["Say a direct request such as: “Jarvis, open Minecraft”", "Use Hindi or Hinglish: “Microsoft Store खोलो और cloud search करो”", "Ask JARVIS to explain, search, create files or control a local system feature"] },
    { title: "Intent Routing", points: ["Local commands stay local: shutdown, volume, app launch and Computer Use do not go to AI", "AI questions use Sarvam first and Ollama when local fallback is available", "If a provider is unavailable, JARVIS reports it clearly instead of pretending success"], layout: "comparison", leftTitle: "LOCAL", rightTitle: "AI" },
    { title: "Computer Use and AccessOS", points: ["Say “start AccessOS” or directly describe the task", "JARVIS can find visible controls, click, type, scroll, drag and press keys", "Every risky action needs approval, the blue or green focus border shows active control, and Emergency Stop cancels the session"], layout: "feature" },
    { title: "Screen Understanding", points: ["JARVIS inspects the shared screen before choosing a target", "It uses alternate labels when an app says Launch, Start, Play, Get or Install", "Low confidence, missing targets or changed screens cause a safe pause instead of a blind click"] },
    { title: "Multi-step App Workflows", points: ["Say: “Open Minecraft” and JARVIS finds an installed launcher without changing the selected version", "Say: “Join the first Survival world” and each step is located and verified", "For any app task, JARVIS searches the official listing, checks the offer status and asks before download or install"], layout: "process" },
    { title: "Official Download Safety", points: ["If the first store has no verified listing, JARVIS can check official store candidates such as Microsoft Store, Xbox, Steam or Epic Games", "Paid or unclear pricing stops the workflow before download", "JARVIS does not search for cracked or pirated software; it can suggest legal alternatives"], layout: "takeaway", callout: "Official source first. Approval before download." },
    { title: "Task Memory and Replay", points: ["Completed workflows are remembered locally as verified steps", "Say “repeat the last task” or “पिछला काम फिर से करो” to replay safely", "Replay performs a fresh screen scan and keeps approval and verification enabled"] },
    { title: "Create Presentations and Files", points: ["Ask for a PPT, PDF, DOCX, XLSX, CSV or ZIP in natural language", "JARVIS validates the requested output and verifies that the file was saved", "Presentation images use balanced frames and preserved aspect ratios for cleaner slides"] },
    { title: "Mission HUD and Evidence", points: ["Mission Control shows the plan, current step, confidence and verification state", "The evidence card explains why JARVIS selected a target", "At the end, JARVIS reports completed steps, proof and any safe pause reason"], layout: "feature" },
    { title: "Recovery and Troubleshooting", points: ["If Ollama is offline, local commands still work and AI requests report the provider status", "If a target moves or a screen changes, JARVIS rescans with bounded retries", "Before an event, run preflight, test the microphone, verify screen-share permissions and rehearse one demo workflow"] },
    { title: "Recommended Demo Flow", points: ["Say: “Jarvis, open Minecraft”", "Ask it to locate Play, keep the selected version and join the first Survival world", "Show the live plan, approval card, blue focus border and final verification report"], layout: "process" },
    { title: "Safety Summary", points: ["JARVIS is approval-gated and fails closed when it cannot verify an action", "Emergency Stop is always available during Computer Use", "Use the latest packaged build and perform one real Windows smoke test before presenting"] }
];

async function main() {
    const outputDir = path.join(__dirname, "..", "presentation-output");
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "JARVIS_User_Guide_2026-10-12.pptx");
    const deck = {
        title: "JARVIS User Guide",
        subtitle: "How to use JARVIS and its voice-first computer workflows",
        language: "en",
        slides
    };
    const buffer = await createPptxBuffer(deck, slides.length + 1);
    const verification = await verifyPptxBuffer(buffer, slides.length + 1, deck);
    if (!verification.valid) throw new Error("Generated JARVIS guide did not verify.");
    fs.writeFileSync(outputPath, buffer, { flag: "wx" });
    console.log(JSON.stringify({ outputPath, slides: verification.slideCount, images: verification.slidesWithImages, bytes: buffer.length }));
}

main().catch(error => { console.error(error.stack || error.message || error); process.exitCode = 1; });
