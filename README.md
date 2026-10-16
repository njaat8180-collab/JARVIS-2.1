# JARVIS Desktop Assistant

JARVIS is a Windows desktop assistant that combines online AI and local desktop features. Normal chat prefers Sarvam AI when an API key and internet connection are available. If Sarvam cannot answer, JARVIS tries the configured local Ollama model, then saved local knowledge and memory.

## What is included

- Voice input with local Whisper support and optional Sarvam speech services.
- Desktop commands for supported apps, files, timers, and system actions.
- A built-in browser with tab controls and HTTP/HTTPS website navigation.
- Chat history and local user memory.
- Office file generation: editable PPTX, study PDFs, formatted XLSX trackers, AI-drafted DOCX documents, CSV templates, and ZIP archives of user-selected files.
- Generated Office files are verified and opened with the Windows default app; generated files saved under JARVIS Documents are listed in the Document Gallery.
- Image search for presentation/PDF artwork when configured or publicly reachable; available results depend on provider access, licenses, and network conditions.
- Screen sharing with image understanding when a compatible local Ollama vision model is installed.
- Approval-gated Computer Use mode for bounded mouse and keyboard control across visible Windows apps.
- Health diagnostics for system resources, agents, and current feature readiness.

## AI setup

1. Open **Settings → AI Provider**, configure the Sarvam API key, and use **Test**.
2. Install and run Ollama to enable local chat fallback. Install at least one chat model and select it in the Ollama settings.
3. To analyze a shared screen, install a vision model in Ollama, for example `ollama pull gemma3:4b`. Vision models can require several gigabytes of disk space and memory.
4. Image search uses the providers configured by the app (including Openverse and Wikimedia Commons, with optional Google Images/Pexels credentials). Search results and downloadable images can be blocked or unavailable; document creation continues without optional artwork.

## Hackathon quickstart

Use a clean Windows machine or Windows user profile for the final demo. Keep API keys and personal data out of the repository.

```powershell
npm ci
npm test
npm start
```

For an installable Windows package, run:

```powershell
npm run build
```

The generated installer is written to `dist/`. Before recording the demo, open Settings, test the configured provider, confirm Ollama is running if local fallback or vision is part of the demo, and run the checklist in [`docs/FINAL_SMOKE_TEST_CHECKLIST.md`](docs/FINAL_SMOKE_TEST_CHECKLIST.md). The suggested 3-minute narrative is in [`docs/HACKATHON_DEMO.md`](docs/HACKATHON_DEMO.md).

Automated Node tests and desktop smoke tests are separate: `npm test` cannot replace checks that require an Electron window, microphone, speakers, Ollama, or a live network.

## Important limits

- Local chat fallback needs a working Ollama server and installed model. If both remote and local AI are unavailable, JARVIS uses saved local knowledge or a brief local fallback response.
- Screen understanding runs on the local vision model; screen sharing itself does not guarantee the model is installed.
- PowerPoint verification checks the file structure, slide count, transitions, embedded image validity, image coverage, and duplicate media. It cannot guarantee that every image is semantically perfect, and actual 3D PowerPoint model objects are not generated.
- Website login, CAPTCHA, DRM, downloads, and site-specific restrictions remain controlled by the website.
- PDFs can include a retrieved Wikipedia source and an available licensed topic image. When those are unavailable, JARVIS records no invented citation and can still generate the PDF.
- DOCX content uses the configured Sarvam provider; CSV templates and ZIP packaging run locally. ZIP creation asks the user to choose input files and a save location.
- Voice commands can choose a simple output name and the JARVIS Documents, Downloads, or Desktop folder for DOCX/CSV/ZIP files. Custom filesystem paths are not accepted as raw voice input.
- Computer Use requires an explicit session start. It exposes only bounded mouse/keyboard primitives; typing, hotkeys, double-clicks, and right-clicks ask for action-time confirmation. It does not execute arbitrary shell commands, enter passwords, or bypass security prompts.

## Technology

- Electron, HTML, CSS, and JavaScript
- Local Whisper and optional Ollama models
- Sarvam AI API for online chat and supported speech features
- Electron Store for settings and persistent data
- `pptxgenjs`, Chromium PDF printing, SheetJS, JSZip, and Mammoth for Office files
