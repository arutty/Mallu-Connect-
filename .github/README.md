# Build APKs from a fork (multi-app)

> [!CAUTION]
> ## ⛔ Uploading these files to YOUR OWN project repo? Do NOT use this folder.
> **This `.github` folder is only for people who FORK the Web2APK repo** (or who want to build 2-3 or more APKs at once).
>
> ### ✅ Copying files into your own repo? Use the `setup/` folder instead:
> **[`setup/.github`](../setup/.github)** - copy that one into the root of your project. It builds a single APK from one `app.json` and one `icon.png`, and always uses the official release.
>
> Do not copy this folder into your own project.

---

## Files

```
.github/
├── run.json                  <- source + which apps to build
├── workflows/build-apk.yml   (leave as is)
├── my-app/
│   ├── app.json              <- name, id, version, url ...
│   └── icon.png              <- app icon
└── other-app/
    ├── app.json
    └── icon.png
```

## Setup

1. Fork the Web2APK repo.
2. Make a folder for each app inside `.github/` (any name, e.g. `my-app`).
3. Put that app's `app.json` and `icon.png` in it. Keep these two file names.
4. Edit `run.json`: choose the `source` and list the folder names in `builds`:

```json
{
  "source": "clone",
  "builds": ["my-app", "other-app"]
}
```

5. Push to `main`, or run it by hand: **Actions → Build APK → Run workflow**.
6. Download the APKs: open the finished run → **Artifacts** → `apk-my-app`.

## `source`: which build script runs?

Choose in `run.json`:

| `source` | What runs | Use it when |
|----------|-----------|-------------|
| `"clone"` (default) | The official, tagged Web2APK release, cloned fresh on every run | You just want APKs. Edits to the build script in your fork are **ignored**. |
| `"."` | `scripts/build.mjs` from **your own fork** | You edited the build script and want your version to run. |

- If `source` is missing, `"clone"` is used.
- Any other value stops the build with an error.
- `"."` needs `scripts/build.mjs` in your repo (a fork has it). If it is missing, the build stops with an error.

## Which release does `"clone"` use?

Set by `WEB2APK_REF` at the top of `.github/workflows/build-apk.yml`:

- `'latest'` (default) → the newest release tag `vX.Y.Z`. New releases are picked up automatically.
- `'v1.1.0'` → one fixed tag that never changes. Safest, because the build script receives your signing secrets.

## Good to know

- Only folders listed in `builds` are built. Other folders are ignored.
- One APK per listed folder, all built at the same time.
- Each app needs its own unique `appId` in its `app.json`.
- `versionCode` in `app.json` must grow with every release.
- JSON files cannot have `//` comments.
