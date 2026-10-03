# Web2APK setup - build ONE APK in your own project

Use this folder when you want to turn **your own web project** into an Android APK.
It builds **one APK** from **one `app.json`** and **one `icon.png`**.

> [!IMPORTANT]
> **Copy only the `.github` folder that is inside this `setup/` folder** ([`setup/.github`](./.github)).
> 📦 **Ready-made zip (always the newest release): [web2apk-setup.zip](https://github.com/bhawan-kavinda/Web2APK/releases/latest/download/web2apk-setup.zip)** - it contains exactly this `.github` folder.
> Do **not** copy the `.github` folder from the root of the Web2APK repo. That one is for people who fork the repo or build several APKs at once.

---

## What is inside

```
setup/
└── .github/
    ├── workflows/build-apk.yml   <- the build (leave as is)
    ├── app.json                  <- your app's name, id, version, link ...
    └── icon.png                  <- your app's icon
```

## How to use (5 steps)

1. **Download** [web2apk-setup.zip](https://github.com/bhawan-kavinda/Web2APK/releases/latest/download/web2apk-setup.zip), unzip it, and **copy** the whole `.github` folder from it into the **root** of your web project's repo.
   (Same folder as `setup/.github` in this repo. The name starts with a dot, so turn on "show hidden files" if you cannot see it.)
   After copying, your project must contain `.github/workflows/build-apk.yml`, `.github/app.json` and `.github/icon.png`.
   If your project already has a `.github` folder, merge the files into it.
2. **Edit `.github/app.json`** (see "app.json" below). At minimum change `appName`, `appId` and `url`.
3. **Replace `.github/icon.png`** with your own icon. Keep the file name `icon.png`.
4. **Push** to `main` (or `master`), or run it by hand: **Actions → Build APK → Run workflow**.
5. **Download your APK:** open the finished run → **Artifacts** → `apk`.

## app.json

Only change what you need. Delete any key you do not need and the default is used.
Keys that start with `_` are notes and are ignored. JSON cannot have `//` comments.

| Key | What it does |
|-----|--------------|
| `appName` | Name shown under the app icon |
| `appId` | Unique Android package name, e.g. `com.mycompany.myapp`. Use a different one for every app |
| `versionName` | Version shown to users, e.g. `1.0.0` |
| `versionCode` | Whole number. **Must grow with every release** |
| `apkName` | Output file name without `.apk` |
| `url` | Your **live website link**. The app loads this site. Leave empty to bundle your repo's web files instead |
| `webDir` | Folder with the built site (only when `url` is empty). Empty = auto-detect |
| `buildCommand` | Command to run before bundling if your site needs a build, e.g. `npm ci && npm run build` |
| `allowNavigation` | Hosts the app may open inside itself. Other links open in the browser. The host of `url` is added automatically |
| `permissions` | Extra Android permissions, e.g. `["CAMERA", "ACCESS_FINE_LOCATION"]` |
| `orientation` | `default`, `portrait` or `landscape` |
| `backgroundColor` | Icon and app background colour, e.g. `#ffffff` |
| `splashColor` | Splash screen colour (empty = same as `backgroundColor`) |
| `offlinePage` | With `url`: show a "No connection" page with a retry button (`true` / `false`) |

Minimal example:

```json
{
  "appName": "My Shop",
  "appId": "com.me.shop",
  "versionName": "1.0.0",
  "versionCode": 1,
  "url": "https://my-shop.com"
}
```

## icon.png

- A square PNG, 1024 × 1024 recommended.
- Other sizes and shapes are converted automatically, but a square image looks best.

## Which Web2APK version is used?

This workflow always downloads an **official, tagged Web2APK release**. It never runs code from your own repo.
By default it uses the **newest release**. To lock one exact release, change this line near the top of `.github/workflows/build-apk.yml`:

```yaml
WEB2APK_REF: 'v1.1.0'    # fixed release   (default is 'latest')
```

## Signing key (optional)

By default a **temporary key** is generated on every build. The APK installs fine, but it **cannot be installed as an update** over an APK that was built with a different key.

For stable updates, create one keystore once and add these as repository secrets
(**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Value |
|--------|-------|
| `KEYSTORE_BASE64` | base64 text of your keystore file |
| `KEYSTORE_PASSWORD` | keystore password |
| `KEY_ALIAS` | alias used when the keystore was created |
| `KEY_PASSWORD` | key password (optional, defaults to `KEYSTORE_PASSWORD`) |

Create the keystore once:

```
keytool -genkeypair -v -keystore my.keystore -alias myalias -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 my.keystore
```

Never commit the keystore or passwords to your repo.

## Troubleshooting

- **Default name, id or icon in the APK** → `.github/app.json` or `.github/icon.png` is missing (see the yellow warning in the run log). You did not copy the whole `setup/.github` folder.
- **Workflow does not start on push** → it only runs on `main` / `master`. Otherwise use **Actions → Build APK → Run workflow**.
- **No APK in Artifacts** → open the run and read the red error in the log.
- **Need 2-3 APKs at once, or want to edit the build script?** → fork the Web2APK repo and use its root `.github` folder instead.
