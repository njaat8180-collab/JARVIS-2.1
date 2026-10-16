# JARVIS Command Center

Added a fast local command layer with 50+ commands for shutdown, restart, sleep, lock, apps, browser, microphone, chat controls and real-time system telemetry.

System diagnosis uses the Electron secure bridge (`jarvis.info.info()`) for CPU, RAM, GPU, storage, battery, network and uptime data rather than invented values.

TTS is non-blocking: JARVIS starts speaking as soon as a response is ready and the chat processing lock is not held until speech finishes.
