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
No Android Studio, no local setup. Pick your way, add your link, run.</p>

---

## 🧭 Which way is for you?

There are **two ways** to use Web2APK. Pick one:

| | 🅰️ **Fork this repo** | 🅱️ **Copy into your own project** |
|---|---|---|
| **For** | Building APKs from a fork, or **2-3+ APKs at once** | Your web project already lives in **its own repo** and you want **one APK** built there |
| **What you use** | the **root** [`.github`](.github) folder | the [`setup/.github`](setup/.github) folder |
| **Config** | `run.json` + one folder per app (`app.json` + `icon.png`) | one `.github/app.json` + one `.github/icon.png` |
| **Build script** | your choice: official release, or your edited fork | always the official release |
| **Full guide** | 👉 **[.github/README.md](.github/README.md)** | 👉 **[setup/README.md](setup/README.md)** |

> [!WARNING]
> **Uploading files to your own project repo? Use the `setup/` folder, NOT the root `.github` folder.**
> The root `.github` folder is only for forks and multi-app builds.

---

## ⚡ 🅰️ Fork this repo (quick view)

<p align="center">
  <img src="assets/easy-setup.svg" alt="Easy setup: 1 Fork, 2 Add your link, 3 Run, 4 Download your APK" width="100%">
</p>

### <img src="assets/icons/fork.svg" width="30" align="absmiddle"> 1. Fork this repo
Click **Fork** (top right of this page).

### <img src="assets/icons/link.svg" width="30" align="absmiddle"> 2. Add your app
In your fork, make a folder inside `.github/` (e.g. `my-app`), put your `app.json` and `icon.png` in it, and list it in `.github/run.json`:

```json
{ "source": "clone", "builds": ["my-app"] }
```

- `source: "clone"` → uses the official Web2APK release. `source: "."` → uses the build script from your own fork.
- List several folders to build **several APKs at once**.

### <img src="assets/icons/run.svg" width="30" align="absmiddle"> 3. Run it, then download
Open **Actions**, press **I understand my workflows, go ahead and enable them**, choose **Build APK → Run workflow**.
When it turns green: **Build APK → (latest run) → Artifacts → `apk-my-app`**. Download, unzip, install. Done.

📖 **More details (all options, `source`, release version): [.github/README.md](.github/README.md)**

<details>
<summary>Prefer the terminal? (GitHub CLI)</summary>

```bash
gh repo fork bhawan-kavinda/Web2APK --clone
# add .github/my-app/app.json + icon.png, list it in .github/run.json, then:
git add -A && git commit -m "my app" && git push
gh workflow run "Build APK"
gh run watch
gh run download -n apk-my-app
```
</details>

---

## 🛠 🅱️ Copy into your own project (quick view)

Use this when your web project already lives in **its own repo** and you want **one APK** built there.

<table>
  <tr>
    <td align="center" width="25%"><img src="assets/icons/copy.svg" width="56"><br><b>1. Copy</b><br><sub>the <code>setup/.github</code> folder<br>into your project</sub></td>
    <td align="center" width="25%"><img src="assets/icons/edit.svg" width="56"><br><b>2. Edit</b><br><sub><code>app.json</code> and<br><code>icon.png</code></sub></td>
    <td align="center" width="25%"><img src="assets/icons/push.svg" width="56"><br><b>3. Push</b><br><sub>to <code>main</code> or<br><code>master</code></sub></td>
    <td align="center" width="25%"><img src="assets/icons/download.svg" width="56"><br><b>4. Download</b><br><sub>your APK from<br>Actions &rarr; Artifacts</sub></td>
  </tr>
</table>

```
your-web-project/
├── index.html
├── ...your site files
└── .github/                ← copied from  setup/.github
    ├── workflows/
    │   └── build-apk.yml   ← leave as is
    ├── app.json            ← edit this
    └── icon.png            ← replace with your logo
```

After pushing, open **Actions → Build APK → (latest run) → Artifacts → `apk`**.

📖 **More details (all `app.json` settings, signing key, troubleshooting): [setup/README.md](setup/README.md)**

---

## What if I skip something?

| Missing | What happens |
|---|---|
| `app.json` | Web2APK's default settings are used (a warning is shown in the log) |
| `icon.png` | Web2APK's default icon is used (a warning is shown in the log) |
| `index.html` in your project | A simple placeholder page is bundled |

---

## Supported languages and frameworks

<p align="center">
  <img src="assets/supported.svg" alt="Web2APK works with React, Vue, Angular, PHP, WordPress, plain HTML and more" width="100%">
</p>

Web2APK wraps a **web app**, so the language does not matter. Only the way you connect the site changes.

| Your project | Mode | What to set in `app.json` |
|---|---|---|
| React, Vite, Vue, Angular, Svelte, Next.js (static export), Astro, Nuxt (generate) | Build and bundle | `buildCommand` + `webDir` |
| PHP, Laravel, WordPress, Django, Flask, Node.js, Rails, ASP.NET, Shopify | Live website URL | `url` |
| HTML, CSS, JavaScript, jQuery, Tailwind, Bootstrap, PWA | Plain files | nothing (auto-detected) |

Examples:

```json
{ "appName": "My React App", "appId": "com.me.react", "buildCommand": "npm ci && npm run build", "webDir": "dist" }
```

```json
{ "appName": "My Laravel Site", "appId": "com.me.laravel", "url": "https://my-site.com" }
```

Common `webDir` values: Vite / Vue = `dist`, Create React App = `build`, Astro = `dist`, Angular = `dist/<project-name>`.

> **Note:** Server code (PHP, Python, Node backend) does not run inside the APK. Host it online and use the `url` mode.

---

## <img src="assets/icons/bulb.svg" width="30" align="absmiddle"> Common cases

**My site is already online** → set `url` to its address. The app always shows the live site, so you don't need to rebuild when the site changes.

**My site needs a build (React, Vite, etc.)** → set `buildCommand` (e.g. `npm ci && npm run build`) and `webDir` (e.g. `dist`).

**My site has a payment page on another domain** → add that domain to `allowNavigation` (e.g. `*.stripe.com`), otherwise the checkout opens in the browser.

**I need camera or location** → add `CAMERA` / `ACCESS_FINE_LOCATION` to `permissions`.

All `app.json` keys are explained in **[setup/README.md → app.json](setup/README.md#appjson)** (the same keys work for both ways).

---

## <img src="assets/icons/key.svg" width="30" align="absmiddle"> Signing key (optional, needed for updates and Play Store)

By default every build uses a **temporary key**. The APK installs fine, but Android will **not** accept it as an *update* over an APK built with a different key. For updates or the Play Store, use one fixed key.

📖 **How to create it and which secrets to add: [setup/README.md → Signing key](setup/README.md#signing-key-optional)**

Never commit your keystore or passwords.

---

## <img src="assets/icons/help.svg" width="30" align="absmiddle"> Troubleshooting

- **The `.github` folder is invisible:** names starting with a dot are hidden. Turn on "show hidden files". On the GitHub website use **Add file → Create new file** and type `.github/workflows/build-apk.yml` as the name.
- **Fork: no Run workflow button:** forks start with Actions turned off. Open the **Actions** tab and enable workflows first.
- **No workflow runs:** check that you pushed to `main` or `master` and that Actions are enabled in your repo.
- **Build fails:** open the failed run and read the red error line. Most errors are a typo in `app.json` (e.g. an invalid `appId`).
- **Blank screen in the app:** with `url`, the site must be online; without it, make sure `index.html` (or your `webDir`) exists.

More help: [.github/README.md](.github/README.md) (fork / multi-app) · [setup/README.md](setup/README.md) (own project).

---

## <img src="assets/icons/flow.svg" width="30" align="absmiddle"> How it works

The workflow reads your `app.json` and `icon.png`, gets the Web2APK build script, wraps your site with [Capacitor](https://capacitorjs.com), builds and signs a release APK, and uploads it as an artifact in **your own** Actions tab.

- 🅱️ **Own project (`setup/`)**: the build script is always cloned from the newest **official release tag**.
- 🅰️ **Fork (root `.github`)**: `run.json` → `"source": "clone"` uses the official release, `"source": "."` uses the script from your fork.

```
.github/                          for forks / multi-app (see .github/README.md)
├── workflows/build-apk.yml
├── run.json                      source + list of apps to build
└── <app-name>/app.json + icon.png
setup/                            for your own project (see setup/README.md)
├── README.md
└── .github/                      copy this folder into your project
    ├── workflows/build-apk.yml
    ├── app.json
    └── icon.png
scripts/build.mjs                 the whole build
defaults/                         fallback app.json and icon.png
placeholder/index.html            page used when no site is found
defaults/offline.html             "No connection" page template (url mode)
assets/                           README banner, logo and icons
example.env                       signing variables (for local builds)
```
