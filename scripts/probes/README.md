# UI probes (dev-only)

Small [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
scripts used to diagnose rendering issues (dark-theme contrast, horizontal
overflow, responsive layout, ticker styling) against a **locally running** app.
They are troubleshooting tools — not part of the build or the deploy.

## Requirements

- `pnpm dev` running on http://localhost:3000
- Chrome/Edge started with remote debugging on port 9333:

  ```powershell
  & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
      --remote-debugging-port=9333 --user-data-dir="$env:TEMP\cdp-profile"
  ```

## Scripts

| Script | What it does |
| --- | --- |
| `_probe_dark.mjs` | Forces dark theme, samples the ticker's real rendered pixels, saves screenshots to `C:\temp` (`ticker_dark.png`, `full_390.png`, `full_1440.png`, `step_NN.png`). |
| `_probe_overflow.mjs [route] [width]` | Finds the exact element overflowing horizontally (default `/` at 390 px). |
| `_probe_responsive.mjs` | Overflow / clipped-text / tap-target audit across viewports (console report). |
| `_probe_ticker.mjs` | Dumps the `.ticker` marquee computed styles. |

Run from the repo root, e.g.:

```powershell
node scripts/probes/_probe_overflow.mjs / 390
```

Screenshot output paths are hard-coded to `C:\temp` (Windows).
