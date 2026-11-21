# سَنَد · SANAD interactive demo

An Arabic, audio-synchronized walkthrough that becomes an interactive banking prototype when the narration finishes.

**[Open the public demo](https://majed-codes.github.io/sanad-interactive-demo/)**

Click **ابدأ العرض** to play. The ElevenLabs Mansour recording drives the Arabic word highlights, phone animations, and progress bar. Pause, replay, and seeking use the same audio clock. At the end, the interactive phone opens automatically. **جرّب بنفسك** skips directly to it.

## Interactive phone

Try the shortfall alert, its calculation, alternative plans, confirmation, transfers between the synthetic accounts, Arabic/English settings, customer selection, and the rule-based chat. The initial Noura scenario has SAR 4,200 in checking and SAR 12,000 in savings. Confirming the SAR 500 transfer gives SAR 4,700 / SAR 11,500, with a projected minimum of SAR +150.

This public edition runs entirely in the browser. Each visitor has their own in-memory demo state; there is no shared server or account sign-in. It uses synthetic seed forecasts exported from the SANAD Python prototype and a browser implementation of the demo calculations and confirmation rules. It does not call a language model, a bank, or a real payment service. Prototype services that are out of scope are labelled in the interface. Financing submissions only create an in-memory demo record.

All people, accounts, transactions, and balances are fictional. The simulated date is fixed at November 18, 2026. This is a concept for the Alinma challenge, not an official bank application.

## Run locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. No API keys, Python packages, Node dependencies, or build are needed.

## Edit

- `index.html`: walkthrough layout and original embedded visual assets.
- `assets/player.js`: audio clock, captions, phone animations, and interactive handoff.
- `assets/timings.json` / `assets/timings.js`: Arabic word cues and phone action times.
- `assets/sanad-mansour-ar.mp3`: supplied ElevenLabs recording.
- `phone/`: original phone interface plus the browser-local demo engine and synthetic seed data.
- `tests/demo-bank.test.js`: forecast parity, confirmation, policy, idempotency, and visitor-isolation checks.

Run the checks with `node --test tests/demo-bank.test.js`.

GitHub Pages serves the repository root from the `main` branch. All asset paths are relative so it also works under a project subpath.
