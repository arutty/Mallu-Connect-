#!/usr/bin/env node
/**
 * Web2APK build script (zero dependencies, Node >= 18).
 *
 * Inputs (all optional, passed as environment variables):
 *   WEB_DIR     the web project to wrap           (default: current directory)
 *   CONFIG_DIR  folder holding app.json + icon.png (default: $WEB_DIR/.github)
 *   OUT_DIR     where the finished APK is written  (default: $WEB_DIR/output)
 *   KEYSTORE_BASE64 / KEYSTORE_PASSWORD / KEY_ALIAS / KEY_PASSWORD   signing key
 *
 * Missing app.json  -> defaults/app.json is used
 * Missing icon.png  -> defaults/icon.png is used
 * Missing keystore  -> a temporary one is generated for this build
 *
 * Flag: --prepare-only  stops after generating config/www/icon (no npm, no Gradle).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = path.resolve(process.env.WEB_DIR || process.cwd());
const CONFIG_DIR = path.resolve(process.env.CONFIG_DIR || path.join(WEB_DIR, '.github'));
const OUT_DIR = path.resolve(process.env.OUT_DIR || path.join(WEB_DIR, 'output'));
const PREPARE_ONLY = process.argv.includes('--prepare-only');

const ANDROID_DIR = path.join(ROOT, 'android');
const WWW_DIR = path.join(ROOT, 'www');
const SECRET_KEYS = ['KEYSTORE_BASE64', 'KEYSTORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'];

// ---------------------------------------------------------------- helpers
const IN_CI = !!process.env.GITHUB_ACTIONS;
const log = (m) => console.log(m);
const step = (m) => console.log(`\n==> ${m}`);
const warn = (m) => console.warn(IN_CI ? `::warning::${m}` : `WARNING: ${m}`);
export function fail(m) {
  console.error(IN_CI ? `::error::${m}` : `ERROR: ${m}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const { quiet, ...spawnOpts } = opts;
  log(`$ ${cmd} ${quiet ? '(arguments hidden)' : args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...spawnOpts });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`Command failed (exit ${r.status}): ${cmd}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fail(`Cannot read ${file}: ${e.message}`);
  }
}

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    if (!filter(s)) continue;
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d, filter);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

/** Minimal .env reader (KEY=VALUE per line, # comments on their own line). Local builds only. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (val && !process.env[m[1]]) process.env[m[1]] = val;
  }
}

/** Read signing secrets, then remove them from process.env so npm scripts / buildCommand never see them. */
function takeSecrets() {
  const s = {};
  for (const k of SECRET_KEYS) {
    s[k] = (process.env[k] || '').trim();
    delete process.env[k];
  }
  return s;
}

// ---------------------------------------------------------------- config
const OPTIONAL_EMPTY = new Set(['url', 'webDir', 'buildCommand', 'apkName']);

export function loadConfig() {
  const defaults = readJson(path.join(ROOT, 'defaults', 'app.json'));
  const userFile = path.join(CONFIG_DIR, 'app.json');
  const custom = fs.existsSync(userFile);
  const user = custom ? readJson(userFile) : {};
  if (custom) log(`Config: ${userFile}`);
  else log('Config: no app.json found -> using Web2APK defaults');

  const cfg = { ...defaults };
  for (const [k, raw] of Object.entries(user)) {
    if (k.startsWith('_')) continue; // allow "_comment" style keys
    if (!(k in defaults)) {
      warn(`Unknown key "${k}" in app.json (ignored)`);
      continue;
    }
    if (raw === null || raw === undefined) continue;
    const v = typeof raw === 'string' ? raw.trim() : raw;
    if (v === '' && !OPTIONAL_EMPTY.has(k)) continue; // empty -> keep default
    cfg[k] = v;
  }
  return { cfg: validate(cfg), custom };
}

export function validate(cfg) {
  const bad = (m) => fail(`app.json: ${m}`);
  const str = (k) => typeof cfg[k] === 'string' || bad(`"${k}" must be a string`);
  ['appName', 'appId', 'versionName', 'apkName', 'url', 'webDir', 'buildCommand', 'androidScheme', 'orientation', 'backgroundColor', 'splashColor'].forEach(str);

  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(cfg.appId))
    bad(`"appId" must look like com.company.app (letters/digits/underscore, at least two parts), got "${cfg.appId}"`);

  const reserved = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null', '_']);
  const badPart = cfg.appId.split('.').find((x) => reserved.has(x.toLowerCase()));
  if (badPart) bad(`"appId" part "${badPart}" is a reserved Java word and breaks the Android build - pick another name, got "${cfg.appId}"`);

  const code = Number(cfg.versionCode);
  if (!Number.isInteger(code) || code < 1 || code > 2100000000) bad('"versionCode" must be a positive integer');
  cfg.versionCode = code;

  if (/["<>&]/.test(cfg.versionName)) bad('"versionName" contains invalid characters');
  if (cfg.url && !/^https?:\/\/[^\s]+$/i.test(cfg.url)) bad('"url" must start with http:// or https://');
  if (!['http', 'https'].includes(cfg.androidScheme)) bad('"androidScheme" must be "http" or "https"');
  if (!['default', 'portrait', 'landscape'].includes(cfg.orientation)) bad('"orientation" must be default, portrait or landscape');
  if (!/^#[0-9a-f]{6}$/i.test(cfg.backgroundColor)) bad('"backgroundColor" must look like #0f1115');
  if (cfg.splashColor && !/^#[0-9a-f]{6}$/i.test(cfg.splashColor)) bad('"splashColor" must look like #0f1115 (or be empty to use backgroundColor)');
  if (!cfg.splashColor) cfg.splashColor = cfg.backgroundColor;
  if (typeof cfg.allowCleartext !== 'boolean') bad('"allowCleartext" must be true or false');
  if (typeof cfg.offlinePage !== 'boolean') bad('"offlinePage" must be true or false');
  for (const k of ['allowNavigation', 'permissions'])
    if (!Array.isArray(cfg[k]) || cfg[k].some((x) => typeof x !== 'string' || !x.trim())) bad(`"${k}" must be an array of strings`);

  cfg.permissions = [...new Set(cfg.permissions.map((p) => p.trim()).map((p) => (p.includes('.') ? p : `android.permission.${p}`)))];
  if (cfg.permissions.some((p) => !/^[A-Za-z0-9_.]+$/.test(p))) bad('"permissions" contains invalid characters');

  cfg.allowNavigation = [...cfg.allowNavigation.map((x) => x.trim())];
  if (cfg.url) {
    const host = new URL(cfg.url).hostname;
    if (!cfg.allowNavigation.includes(host)) cfg.allowNavigation.push(host);
    if (/^http:/i.test(cfg.url) && !cfg.allowCleartext) warn('"url" is http:// but "allowCleartext" is false - the app will not be able to load it');
  }

  if (!cfg.appName.trim()) bad('"appName" is empty');
  if (/[<>&"]/.test(cfg.appName)) bad('"appName" must not contain < > & or "');
  if (!cfg.apkName) cfg.apkName = cfg.appName;
  cfg.apkName = cfg.apkName.replace(/\.apk$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
  return cfg;
}

// ---------------------------------------------------------------- web content
function insideWebDir(p) {
  const rel = path.relative(WEB_DIR, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function findWebRoot(cfg) {
  if (cfg.webDir) {
    const p = path.resolve(WEB_DIR, cfg.webDir);
    if (!insideWebDir(p)) fail(`"webDir" must be inside the web repo: ${cfg.webDir}`);
    if (!fs.existsSync(path.join(p, 'index.html')))
      fail(`"webDir" is "${cfg.webDir}" but ${path.join(p, 'index.html')} does not exist (did the buildCommand run?)`);
    return p;
  }
  for (const c of ['dist', 'build', 'www', 'public']) {
    const p = path.join(WEB_DIR, c);
    if (fs.existsSync(path.join(p, 'index.html'))) return p;
  }
  // a root index.html is the site itself; docs/ (often GitHub Pages documentation) is only a last resort
  if (fs.existsSync(path.join(WEB_DIR, 'index.html'))) return WEB_DIR;
  if (fs.existsSync(path.join(WEB_DIR, 'docs', 'index.html'))) return path.join(WEB_DIR, 'docs');
  return null;
}

function warnIfBuildBased(cfg, root) {
  if (cfg.buildCommand) return;
  const pkg = path.join(WEB_DIR, 'package.json');
  if (!fs.existsSync(pkg)) return;
  try {
    const scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts || {};
    if (scripts.build && (root === WEB_DIR || path.basename(root) === 'public'))
      warn('This looks like a project that needs a build step. Set "buildCommand" (e.g. "npm ci && npm run build") and "webDir" (e.g. "dist") in app.json.');
  } catch { /* ignore */ }
}

/** "No connection" page shown instead of a blank error screen when the live url cannot be loaded. */
function writeOfflinePage(cfg) {
  const tpl = fs.readFileSync(path.join(ROOT, 'defaults', 'offline.html'), 'utf8');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(cfg.backgroundColor.slice(i, i + 2), 16));
  const fg = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111111' : '#f2f2f4';
  const url = JSON.stringify(cfg.url).replace(/</g, '\\u003c');
  const out = tpl
    .replace(/__BG__/g, () => cfg.backgroundColor)
    .replace(/__FG__/g, () => fg)
    .replace(/__NAME__/g, () => cfg.appName)
    .replace(/__URL__/g, () => url); // url last, so nothing in it is treated as a placeholder
  fs.writeFileSync(path.join(WWW_DIR, 'offline.html'), out);
}

function prepareWeb(cfg) {
  step('Preparing web content');
  fs.rmSync(WWW_DIR, { recursive: true, force: true });

  if (cfg.url) {
    log(`url is set -> app will load ${cfg.url} (web files are not bundled)`);
    copyDir(path.join(ROOT, 'placeholder'), WWW_DIR);
    if (cfg.offlinePage) writeOfflinePage(cfg);
    return;
  }

  if (cfg.buildCommand) {
    log(`Running buildCommand in ${WEB_DIR}: ${cfg.buildCommand}`);
    const r = spawnSync(cfg.buildCommand, { shell: true, stdio: 'inherit', cwd: WEB_DIR });
    if (r.status !== 0) fail(`buildCommand failed (exit ${r.status})`);
  }

  const root = findWebRoot(cfg);
  if (!root) {
    warn('No index.html found in the web repo (looked in dist, build, www, public, the repo root and docs) - building with a placeholder page. Set "webDir" or "url" in app.json.');
    copyDir(path.join(ROOT, 'placeholder'), WWW_DIR);
    return;
  }
  warnIfBuildBased(cfg, root);
  log(`Bundling web files from ${root}`);
  const skipTop = new Set(['.git', '.github', 'node_modules', 'output', '.web2apk', '.env']);
  // When the web folder is the Web2APK folder itself, also skip the files this script generates
  // (otherwise www/ is copied into itself forever and .keystore would end up inside the APK).
  if (WEB_DIR === ROOT) ['www', 'android', 'resources', '.keystore', 'capacitor.config.json'].forEach((n) => skipTop.add(n));
  copyDir(root, WWW_DIR, (p) => {
    if (path.resolve(p) === WWW_DIR || path.resolve(p) === ANDROID_DIR) return false; // destination inside source -> infinite recursion
    return root !== WEB_DIR || !skipTop.has(path.relative(root, p).split(path.sep)[0]);
  });
}

export function writeCapacitorConfig(cfg) {
  const server = { androidScheme: cfg.androidScheme, cleartext: cfg.allowCleartext, allowNavigation: cfg.allowNavigation };
  if (cfg.url) {
    server.url = cfg.url;
    if (cfg.offlinePage) server.errorPath = 'offline.html';
  }
  const capCfg = {
    appId: cfg.appId,
    appName: cfg.appName,
    webDir: 'www',
    backgroundColor: cfg.backgroundColor,
    server,
    plugins: { SplashScreen: { launchAutoHide: true, launchShowDuration: 1000, backgroundColor: cfg.splashColor, showSpinner: false } },
    android: { allowMixedContent: cfg.allowCleartext },
  };
  fs.writeFileSync(path.join(ROOT, 'capacitor.config.json'), JSON.stringify(capCfg, null, 2) + '\n');
  log('Generated capacitor.config.json');
}

// ---------------------------------------------------------------- icon
function pickIcon() {
  const mine = path.join(CONFIG_DIR, 'icon.png');
  if (fs.existsSync(mine)) {
    log(`Icon: ${mine}`);
    return { file: mine, custom: true };
  }
  log('Icon: no icon.png found -> using Web2APK default icon');
  return { file: path.join(ROOT, 'defaults', 'icon.png'), custom: false };
}

/** Normalises any image (even a JPEG named .png, or a non-square one) into a 1024x1024 PNG. */
async function prepareIcon(src, { plain = false } = {}) {
  const dstDir = path.join(ROOT, 'resources');
  const dst = path.join(dstDir, 'icon.png');
  fs.rmSync(dstDir, { recursive: true, force: true });
  fs.mkdirSync(dstDir, { recursive: true });
  if (!plain) {
    try {
      const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
      await sharp(src).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(dst);
      return;
    } catch (e) {
      warn(`Could not normalise icon (${e.message}); using it as-is`);
    }
  }
  fs.copyFileSync(src, dst);
}

/** Splash image: splashColor background with the icon in the middle (capacitor-assets turns it into every Android size). */
async function prepareSplash(cfg) {
  try {
    const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
    const size = 2732;
    const logoSize = Math.round(size * 0.28);
    const logo = await sharp(path.join(ROOT, 'resources', 'icon.png'))
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: cfg.splashColor } })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toFile(path.join(ROOT, 'resources', 'splash.png'));
  } catch (e) {
    warn(`Could not create the splash image (${e.message}); the default splash will be used`);
  }
}

// ---------------------------------------------------------------- android patching
function replaceOnce(text, re, replacement, label) {
  if (!re.test(text)) {
    warn(`Could not patch ${label} (template changed?)`);
    return text;
  }
  return text.replace(re, replacement);
}

export function patchProject(androidDir, cfg) {
  const main = path.join(androidDir, 'app', 'src', 'main');

  // network security config
  fs.mkdirSync(path.join(main, 'res', 'xml'), { recursive: true });
  fs.writeFileSync(
    path.join(main, 'res', 'xml', 'network_security_config.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="${cfg.allowCleartext}">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
`,
  );

  // manifest
  const manifestFile = path.join(main, 'AndroidManifest.xml');
  let m = fs.readFileSync(manifestFile, 'utf8');
  if (!m.includes('android:networkSecurityConfig'))
    m = replaceOnce(m, /<application(\s)/, '<application android:networkSecurityConfig="@xml/network_security_config"$1', 'networkSecurityConfig');
  if (cfg.orientation !== 'default' && !m.includes('android:screenOrientation'))
    m = replaceOnce(m, /<activity(\s)/, `<activity android:screenOrientation="${cfg.orientation}"$1`, 'screenOrientation');
  const perms = cfg.permissions.filter((p) => !m.includes(`android:name="${p}"`));
  if (perms.length)
    m = replaceOnce(m, /<\/manifest>/, perms.map((p) => `    <uses-permission android:name="${p}" />\n`).join('') + '</manifest>', 'permissions');
  fs.writeFileSync(manifestFile, m);

  // version
  const gradleFile = path.join(androidDir, 'app', 'build.gradle');
  let g = fs.readFileSync(gradleFile, 'utf8');
  g = replaceOnce(g, /versionCode\s+\d+/, `versionCode ${cfg.versionCode}`, 'versionCode');
  g = replaceOnce(g, /versionName\s+"[^"]*"/, `versionName "${cfg.versionName}"`, 'versionName');
  fs.writeFileSync(gradleFile, g);
}

const SIGNING_GRADLE = `

// ---- added by Web2APK: sign the release build (values come from environment variables)
android {
    signingConfigs {
        web2apk {
            storeFile file(System.getenv("W2A_KEYSTORE_PATH"))
            storePassword System.getenv("W2A_KEYSTORE_PASSWORD")
            keyAlias System.getenv("W2A_KEY_ALIAS")
            keyPassword System.getenv("W2A_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.web2apk
        }
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
`;

export function injectSigning(androidDir) {
  fs.appendFileSync(path.join(androidDir, 'app', 'build.gradle'), SIGNING_GRADLE);
}

// ---------------------------------------------------------------- signing
export function setupKeystore(secrets, cfg) {
  const dir = path.join(ROOT, '.keystore');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'release.keystore');

  if (secrets.KEYSTORE_BASE64) {
    if (!secrets.KEYSTORE_PASSWORD || !secrets.KEY_ALIAS)
      fail('KEYSTORE_BASE64 is set, so KEYSTORE_PASSWORD and KEY_ALIAS must be set too (see example.env).');
    fs.writeFileSync(file, Buffer.from(secrets.KEYSTORE_BASE64.replace(/\s+/g, ''), 'base64'));
    log('Signing: using your keystore from secrets');
    return { file, storePassword: secrets.KEYSTORE_PASSWORD, alias: secrets.KEY_ALIAS, keyPassword: secrets.KEY_PASSWORD || secrets.KEYSTORE_PASSWORD, generated: false };
  }

  log('Signing: no keystore provided -> generating a temporary one for this build');
  const password = crypto.randomBytes(16).toString('hex');
  const alias = 'web2apk';
  const cn = cfg.appName.replace(/[^A-Za-z0-9 ]/g, '').trim() || 'Web2APK';
  run(
    'keytool',
    ['-genkeypair', '-noprompt', '-keystore', file, '-storetype', 'PKCS12', '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-storepass', password, '-keypass', password, '-dname', `CN=${cn}, OU=Web2APK, O=Web2APK, C=US`],
    { quiet: true, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return { file, storePassword: password, alias, keyPassword: password, generated: true };
}

export function printFingerprint(ks) {
  const r = spawnSync('keytool', ['-list', '-v', '-keystore', ks.file, '-storepass', ks.storePassword, '-alias', ks.alias], { encoding: 'utf8' });
  const line = (r.stdout || '').split('\n').find((l) => l.includes('SHA256:'));
  if (line) log(`Signing certificate ${line.trim()}`);
}

/**
 * Creates the launcher icons from resources/icon.png.
 * --assetPath is explicit on purpose: capacitor-assets otherwise looks in ./assets first, and any
 * unrelated "assets" folder in the Web2APK repo made it print "No assets found" and skip the icons.
 * If it still reports that, the build stops instead of silently shipping the default Capacitor icon.
 */
function generateIcons(cfg) {
  const args = ['capacitor-assets', 'generate', '--android', '--assetPath', 'resources', '--iconBackgroundColor', cfg.backgroundColor, '--iconBackgroundColorDark', cfg.backgroundColor, '--splashBackgroundColor', cfg.splashColor, '--splashBackgroundColorDark', cfg.splashColor];
  log(`$ npx ${args.join(' ')}`);
  const r = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) fail(`npx: ${r.error.message}`);
  if (r.status !== 0) fail(`Command failed (exit ${r.status}): capacitor-assets`);
  if (/no assets found/i.test(`${r.stdout || ''}${r.stderr || ''}`))
    fail('capacitor-assets found no icon source (expected resources/icon.png), so the APK would keep the default icon.');
}

// ---------------------------------------------------------------- main
function writeSummary(cfg, info) {
  const lines = [
    '### APK built',
    `- **App:** ${cfg.appName} (\`${cfg.appId}\`) v${cfg.versionName} (code ${cfg.versionCode})`,
    `- **Content:** ${cfg.url ? `loads ${cfg.url}` : 'bundled web files'}`,
    `- **Config:** ${info.customConfig ? 'your app.json' : 'default (no app.json found)'}`,
    `- **Icon:** ${info.customIcon ? 'your icon.png' : 'default (no icon.png found)'}`,
    `- **Signing:** ${info.keystore.generated ? 'temporary generated keystore - this APK cannot update an APK signed with another key. See example.env to use a fixed key.' : 'your keystore'}`,
    `- **File:** \`${path.basename(info.apk)}\` (${(fs.statSync(info.apk).size / 1048576).toFixed(1)} MB)`,
    '',
  ];
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `apk_path=${info.apk}\n`);
}

export async function main() {
  log('Web2APK');
  log(`  web repo : ${WEB_DIR}`);
  log(`  config   : ${CONFIG_DIR}`);
  log(`  output   : ${OUT_DIR}`);

  loadEnvFile(path.join(ROOT, '.env'));
  const secrets = takeSecrets();

  step('Reading config');
  const { cfg, custom: customConfig } = loadConfig();
  const icon = pickIcon();

  prepareWeb(cfg);
  writeCapacitorConfig(cfg);

  if (PREPARE_ONLY) {
    await prepareIcon(icon.file, { plain: true });
    log('\n--prepare-only: stopping before npm / Gradle.');
    return;
  }

  step('Installing dependencies');
  run('npm', ['install', '--no-audit', '--no-fund']);
  await prepareIcon(icon.file);
  await prepareSplash(cfg);

  step('Creating fresh Android project');
  fs.rmSync(ANDROID_DIR, { recursive: true, force: true });
  run('npx', ['cap', 'add', 'android']);

  step('Generating launcher icons');
  generateIcons(cfg);

  step('Applying app settings');
  patchProject(ANDROID_DIR, cfg);
  run('npx', ['cap', 'sync', 'android']);

  step('Signing setup');
  const keystore = setupKeystore(secrets, cfg);
  printFingerprint(keystore);
  injectSigning(ANDROID_DIR);

  step('Building release APK');
  const gradlew = path.join(ANDROID_DIR, 'gradlew');
  fs.chmodSync(gradlew, 0o755);
  run(gradlew, ['assembleRelease', '--no-daemon'], {
    cwd: ANDROID_DIR,
    env: { ...process.env, W2A_KEYSTORE_PATH: keystore.file, W2A_KEYSTORE_PASSWORD: keystore.storePassword, W2A_KEY_ALIAS: keystore.alias, W2A_KEY_PASSWORD: keystore.keyPassword },
  });

  step('Collecting APK');
  const built = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(built)) fail(`Expected APK not found: ${built}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const apk = path.join(OUT_DIR, `${cfg.apkName}.apk`);
  fs.copyFileSync(built, apk);
  log(`\nDone: ${apk}`);
  writeSummary(cfg, { customConfig, customIcon: icon.custom, keystore, apk });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
}
