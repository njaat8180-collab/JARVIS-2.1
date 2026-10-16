JARVIS Reference Voice Directory
================================

Place your reference voice WAV file here:

    voices/jarvis_reference.wav

This file is used by XTTS-v2 to clone the JARVIS voice.

Recording Guidelines:
---------------------
1. Duration: 15–30 seconds
2. Single speaker only
3. Clean audio — minimal background noise
4. No music, no echo, no reverb
5. Natural speaking style (conversational, not reading)
6. Consistent microphone distance
7. Natural pronunciation and pace
8. Record in a quiet room with good acoustics

What to say:
-----------
Any natural speech works. You don't need to say anything specific.
A good example:

    "Hello, I'm your JARVIS assistant. I'm here to help you with
    anything you need — from opening apps to checking the weather,
    managing your schedule, or just having a conversation. How can
    I assist you today?"

How to record:
--------------
- Use any audio recording app (Audacity, Windows Voice Recorder, etc.)
- Export as WAV format (16-bit, 22050Hz or 44100Hz, mono or stereo)
- Save as: voices/jarvis_reference.wav

The file is loaded ONCE at server startup and the speaker embedding
is cached for all subsequent generation requests.
