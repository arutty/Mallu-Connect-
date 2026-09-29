<p align="center">
  <img src="assets/banner.svg" alt="Web2APK - turn any website into an Android APK" width="100%">
</p>

<p align="center">
  <img alt="Android" src="https://img.shields.io/badge/Android-APK-3DDC84?logo=android&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub-Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="Capacitor" src="https://img.shields.io/badge/Built%20with-Capacitor-119EFF?logo=capacitor&logoColor=white">
  <img alt="No local setup" src="https://img.shields.io/badge/Setup-none-ff8a1f">
</p>

<p align="center"><b>Turn any website or web project into an Android APK using GitHub Actions.</b><br>
No Android Studio, no local setup. Just copy one folder and push.</p>

<table>
  <tr>
    <td align="center" width="25%"><img src="assets/icons/copy.svg" width="56"><br><b>1. Copy</b><br><sub>the <code>.github</code> folder<br>into your project</sub></td>
    <td align="center" width="25%"><img src="assets/icons/edit.svg" width="56"><br><b>2. Edit</b><br><sub><code>app.json</code> and<br><code>icon.png</code></sub></td>
    <td align="center" width="25%"><img src="assets/icons/push.svg" width="56"><br><b>3. Push</b><br><sub>to <code>main</code> or<br><code>master</code></sub></td>
    <td align="center" width="25%"><img src="assets/icons/download.svg" width="56"><br><b>4. Download</b><br><sub>your APK from<br>Actions &rarr; Artifacts</sub></td>
  </tr>
</table>

---

## Quick start (3 steps)

**1. Copy the `.github` folder**
Download this repo (**Code → Download ZIP**) and copy its `.github` folder into the **root of your web project**, next to your `index.html`.

```
your-web-project/
├── index.html
├── ...your site files
└── .github/
    ├── workflows/
    │   └── build-apk.yml   ← leave as is
    ├── app.json            ← edit this
    └── icon.png            ← replace with your logo
```

**2. Edit two files**
- `.github/app.json` → app name, package id, version (see the Settings table below)
- `.github/icon.png` → your app icon (square, 1024×1024 is best)

**3. Push to GitHub**
Push to the `main` or `master` branch (or run the workflow by hand).
Then open:

> **Actions → Build APK → (latest run) → Artifacts → apk**

Download it, unzip, install. Done.

> **Want a different app?** Change only `app.json` and `icon.png`.

---

## What if I skip something?

| Missing | What happens |
|---|---|
| `app.json` | Web2APK's default settings are used |
| `icon.png` | Web2APK's default icon is used (<img src="assets/logo.png" width="18" align="absmiddle"> this one) |
| `index.html` in your project | A simple placeholder page is bundled |

---

## <img src="assets/icons/settings.svg" width="30" align="absmiddle"> Settings (`app.json`)

Only change what you need. Missing keys use the defaults. Keys starting with `_` are notes and are ignored.

| Key | Meaning | Default |
|---|---|---|
| `appName` | Name under the app icon | `Web2APK App` |
| `appId` | Unique package name, e.g. `com.me.myapp` (use a new one for each app) | `com.web2apk.app` |
| `versionName` | Version shown to users | `1.0.0` |
| `versionCode` | Whole number, **must increase** with every release | `1` |
| `apkName` | Output file name, without `.apk` | from `appName` |
| `url` | Load a **live website** instead of bundling files, e.g. `https://example.com` | empty |
| `webDir` | Folder with the built site (empty = auto-detect `dist`, `build`, `www`, `public`, `docs`, then root) | empty |
| `buildCommand` | Run before bundling, e.g. `npm ci && npm run build` | empty |
| `allowNavigation` | Hosts allowed inside the app. Other links open in the browser. Wildcards work: `*.example.com` | localhost only |
| `permissions` | Extra Android permissions, e.g. `["CAMERA", "ACCESS_FINE_LOCATION"]` | none |
| `orientation` | `default`, `portrait` or `landscape` | `default` |
| `backgroundColor` | Icon and app background colour | `#0f1115` |
| `androidScheme` / `allowCleartext` | `https` or `http` / allow plain `http://` traffic | `https` / `true` |

Minimal example:

```json
{ "appName": "My Shop", "appId": "com.me.shop", "url": "https://my-shop.com" }
```

---

## <img src="assets/icons/bulb.svg" width="30" align="absmiddle"> Common cases

**My site is already online** → set `url` to its address. The app always shows the live site, so you don't need to rebuild when the site changes.

**My site needs a build (React, Vite, etc.)** → set `buildCommand` (e.g. `npm ci && npm run build`) and `webDir` (e.g. `dist`).

**My site has a payment page on another domain** → add that domain to `allowNavigation` (e.g. `*.stripe.com`), otherwise the checkout opens in the browser.

**I need camera or location** → add `CAMERA` / `ACCESS_FINE_LOCATION` to `permissions`.

---

## <img src="assets/icons/key.svg" width="30" align="absmiddle"> Signing key (optional, needed for updates and Play Store)

By default every build uses a **temporary key**. The APK installs fine, but Android will **not** accept it as an *update* over an APK built with a different key.

If you release updates or publish to the Play Store, use one fixed key:

1. Create it once:
   ```bash
   keytool -genkeypair -v -keystore my.keystore -alias myalias -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 my.keystore
   ```
2. In your web repo go to **Settings → Secrets and variables → Actions → New repository secret** and add:

   | Secret | Value |
   |---|---|
   | `KEYSTORE_BASE64` | the base64 text from above |
   | `KEYSTORE_PASSWORD` | your keystore password |
   | `KEY_ALIAS` | `myalias` |
   | `KEY_PASSWORD` | optional, defaults to the keystore password |

Never commit your keystore or passwords.

---

## <img src="assets/icons/help.svg" width="30" align="absmiddle"> Troubleshooting

- **The `.github` folder is invisible:** names starting with a dot are hidden. Turn on "show hidden files". On the GitHub website use **Add file → Create new file** and type `.github/workflows/build-apk.yml` as the name.
- **No workflow runs:** check that you pushed to `main` or `master` and that Actions are enabled in your repo.
- **Build fails:** open the failed run and read the red error line. Most errors are a typo in `app.json` (e.g. an invalid `appId`).
- **Blank screen in the app:** with `url`, the site must be online; without it, make sure `index.html` (or your `webDir`) exists.

---

## <img src="assets/icons/flow.svg" width="30" align="absmiddle"> How it works

Your workflow clones this public repo, reads your `app.json` and `icon.png`, wraps your site with [Capacitor](https://capacitorjs.com), builds and signs a release APK, and uploads it as an artifact in **your own** Actions tab.

```
.github/workflows/build-apk.yml   workflow users copy
.github/app.json                  starter settings
.github/icon.png                  starter icon
scripts/build.mjs                 the whole build
defaults/                         fallback app.json and icon.png
placeholder/index.html            page used when no site is found
assets/                           README banner, logo and icons
example.env                       signing variables (for local builds)
```
