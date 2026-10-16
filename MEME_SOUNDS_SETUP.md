# JARVIS Meme Sounds

Put authorized/licensed meme audio files in `assets/sounds/memes/`. The engine is non-blocking and uses a 2.5s cooldown. Missing files fail silently.

## Setup (you need to do this — Claude can't add the audio itself)

`assets/sounds/memes/memeSounds.json` already lists all 50 sound ids and
the exact filename each one expects (e.g. `moai.mp3`, `vine-boom.mp3`,
`stonks.mp3`...). Claude cannot create, download, or redistribute actual
meme audio clips — most of the well-known ones (Vine boom, bruh, stonks,
emotional damage, etc.) are copyrighted, and Anthropic's copyright policy
means Claude won't source or reproduce that kind of media. To finish the
setup:

1. Get your own legally-obtained copies of each sound (public-domain
   sources, sounds you made yourself, or a properly licensed sound pack).
2. Name each file exactly as listed in `memeSounds.json` / the `files`
   map in `renderer/js/jarvisMemeSounds.js`.
3. Drop them into `assets/sounds/memes/`. No code changes needed — the
   engine already looks for all 50 filenames there.

## What the code side already does

- All 50 sound ids are wired into trigger categories (`joke`, `funny`,
  `unexpected`, `confused`, `suspicious`, `failure`, `success`,
  `achievement`, `taskComplete`, `dramatic`, `error`, `money`,
  `moneyFailure`, `notify`, `ui`) — every id is reachable, not just half
  of them (see `docs/ERROR_LOG.md` E011 for what was fixed here).
- `triggerFromResponse(userText, replyText, source)` runs after every
  chat reply and picks a category from the reply's content and which
  task pipeline produced it.
- `triggerForTask(taskName, outcome)` is a direct hook for a specific
  task actually finishing, already wired into: opening a new browser
  tab, and a download completing/failing. Call it from anywhere else a
  concrete task finishes, e.g.:
  ```js
  window.JARVIS_MemeSounds?.triggerForTask?.("some-task-name", "success");
  ```

DevTools: `JARVIS_MemeSounds.trigger("unexpected")`, `JARVIS_MemeSounds.play("moai")`.
