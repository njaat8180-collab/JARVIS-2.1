# Reliability hardening — 2026-10-11

This repair pass focused on failures that could make JARVIS appear responsive while silently losing state.

## Changes

- Added a shared crash-safe JSON writer with bounded Windows replacement retries, a complete-file copy fallback for `EPERM`/`EBUSY`/`EEXIST`, and temporary-file cleanup.
- Applied the writer to assistant tasks, user registry/profile data, evolution proposals/checkpoints, Ollama model settings, XTTS settings, and consciousness/personality state.
- Kept `src/ai/memory.js` dependency-free by design while giving its local writer the same Windows-safe fallback.
- Made generated-file verification tolerant of managed Windows environments that deny `realpath()` even when `stat()` and file reads succeed; lexical output-root validation remains enforced.
- Added a monotonic voice-capture generation guard so a timed-out or aborted Whisper request cannot deliver a stale transcript into a newer command turn.
- Added a regression test for the Windows rename fallback.

## Validation

- Assistant orchestration suite: 36/36 passing.
- Memory, user-system, evolution, and persistence-focused suites pass.
- Full suite after hardening: 545/556 test cases passed, 13 intentional skips, and 4 localhost HTTP tests blocked by the managed sandbox's `EACCES` policy. The blocked tests are the Sarvam/OpenAI-compatible client integration checks; they need a normal desktop test environment that permits loopback listeners.

## Limits

- Real microphone capture, Whisper decoding, TTS playback, Ollama, Sarvam, and packaged Electron startup still require a normal Windows desktop environment with microphone permissions and the relevant local runtimes/services.
- The local voice pipeline remains final-utterance based; true streaming partial Whisper transcripts are not claimed.
- No new destructive desktop action was enabled. Existing system actions remain approval-gated.
