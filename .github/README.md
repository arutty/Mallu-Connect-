# Build APKs from this repo

## Files

```
.github/
├── run.json              <- which apps to build
├── workflows/build-apk.yml   (leave as is)
├── my-app/
│   ├── app.json          <- name, id, version, url ...
│   └── icon.png          <- app icon
└── other-app/
    ├── app.json
    └── icon.png
```

## Setup

1. Make a folder for each app inside `.github/` (any name, e.g. `my-app`).
2. Put that app's `app.json` and `icon.png` in it. Keep these two file names.
3. List the folder names in `run.json`:

```json
{ "builds": ["my-app", "other-app"] }
```

4. Push to `main`, or run it by hand: **Actions → Build APK → Run workflow**.
5. Download the APKs: open the finished run → **Artifacts** → `apk-my-app`.

## Good to know

- Only folders listed in `run.json` are built. Other folders are ignored.
- One APK per listed folder, all built at the same time.
- Each app needs its own unique `appId` in its `app.json`.
- `versionCode` in `app.json` must grow with every release.
- JSON files cannot have `//` comments.
