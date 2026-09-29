# Web2APK

Turn **any web project** into an Android APK with GitHub Actions - no Android tooling needed.

## For users (anyone who wants an APK)

1. Download/clone this repo and copy its **`.github`** folder into the root of **your web project** (same level as your `index.html`). It holds exactly three files:

   | File | What to do |
   |---|---|
   | `.github/workflows/build-apk.yml` | leave as is |
   | `.github/app.json` | edit app name, id, version, ... |
   | `.github/icon.png` | replace with your logo (square, 1024x1024 is best) |

2. Push to `main`/`master` (or run the workflow manually).
3. Open **Actions -> Build APK -> the run -> Artifacts -> apk** and download your APK.

To make a different app, change only `app.json` and `icon.png`.

- Delete `app.json` and/or `icon.png` -> Web2APK's own `defaults/app.json` and `defaults/icon.png` are used.
- No `index.html` found in your project -> a small placeholder page is bundled.
- Your project needs a build step (React, Vite, ...)? Set `buildCommand` and `webDir` in `app.json`.

## For the owner of this repo

1. Keep this repo **public** and named `Web2APK` under `bhawan-kavinda` (`WEB2APK_REPO` in `.github/workflows/build-apk.yml` already points to `bhawan-kavinda/Web2APK`). If you ever move or rename it, change that one line.
2. Pushing to this repo also runs the workflow on itself as a self-test (placeholder page + default settings).

## app.json

| Key | Meaning | Default |
|---|---|---|
| `appName` | Name under the launcher icon | `Web2APK App` |
| `appId` | Android package, e.g. `com.me.shop` | `com.web2apk.app` |
| `versionName` / `versionCode` | Shown version / integer that must grow with each release | `1.0.0` / `1` |
| `apkName` | Output file name (no `.apk`); empty = from `appName` | `""` |
| `url` | If set, the app loads this address instead of bundling files (e.g. `http://localhost:8080` for a Termux server) | `""` |
| `webDir` | Folder with the built site. Empty = auto-detect `dist`, `build`, `www`, `public`, `docs`, then repo root | `""` |
| `buildCommand` | Run in the web repo before bundling, e.g. `npm ci && npm run build` (then set `webDir` to `dist`) | `""` |
| `androidScheme` | `https` or `http` | `https` |
| `allowCleartext` | Allow plain `http://` traffic | `true` |
| `allowNavigation` | Hosts the app may navigate to (others open in the browser) | localhost, 127.0.0.1, 10.0.2.2 |
| `permissions` | Extra Android permissions, e.g. `["CAMERA", "RECORD_AUDIO"]` | `[]` |
| `orientation` | `default`, `portrait`, `landscape` | `default` |
| `backgroundColor` | Launcher-icon background and WebView colour | `#0f1115` |

Missing keys fall back to the defaults, so `app.json` can be as small as `{ "appName": "Shop", "appId": "com.me.shop" }`.

## Signing keys

See [`example.env`](example.env). Add `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` (and optionally `KEY_PASSWORD`) as **repository secrets** in the web repo. Never commit them.

No keys set → a temporary keystore is generated for that build. The APK installs normally, but Android will refuse to install it as an *update* over an APK signed with a different key. Use a fixed keystore if you release updates.

## Local build

```bash
cp example.env .env      # optional
WEB_DIR=/path/to/web CONFIG_DIR=/path/to/web/.github node scripts/build.mjs
```
Needs Node 18+, JDK 17 and the Android SDK. `--prepare-only` only generates the config and web files.

## Layout

```
.github/workflows/build-apk.yml   workflow users copy (clones this repo, builds, uploads the APK)
.github/app.json                  starter settings users edit
.github/icon.png                  starter icon users replace
scripts/build.mjs                 the whole build (reads app.json, patches Android, signs, builds)
defaults/app.json                 fallback settings when the user has no app.json
defaults/icon.png                 fallback icon when the user has no icon.png
placeholder/index.html            bundled when no web content is found
example.env                       signing variables
```

---

## සිංහලෙන් (short)

**Users ට:**
1. මේ repo එකේ **`.github`** folder එක එහෙන්ම ඔයාගේ web project එකේ root එකට copy කරන්න (workflow + `app.json` + `icon.png`).
2. `app.json` edit කරලා `icon.png` වෙනස් කරන්න. (ඒ දෙක delete කළොත් මේ repo එකේ `defaults/` ඇති ඒවා use වෙනවා.)
3. Push කරන්න. **Actions -> Build APK -> Artifacts -> apk** එකෙන් APK එක download කරගන්න.

**Repo owner ට:** Repo එක public + නම `Web2APK` (`bhawan-kavinda/Web2APK`) වෙන්න ඕන. නම/account එක වෙනස් කළොත් විතරක් `WEB2APK_REPO` වෙනස් කරන්න.
