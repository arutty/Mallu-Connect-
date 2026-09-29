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
  ['appName', 'appId', 'versionName', 'apkName', 'url', 'webDir', 'buildCommand', 'androidScheme', 'orientation', 'backgroundColor'].forEach(str);

  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(cfg.appId))
    bad(`"appId" must look like com.company.app (letters/digits/underscore, at least two parts), got "${cfg.appId}"`);

  const code = Number(cfg.versionCode);
  if (!Number.isInteger(code) || code < 1 || code > 2100000000) bad('"versionCode" must be a positive integer');
  cfg.versionCode = code;

  if (/["<>&]/.test(cfg.versionName)) bad('"versionName" contains invalid characters');
  if (cfg.url && !/^https?:\/\/[^\s]+$/i.test(cfg.url)) bad('"url" must start with http:// or https://');
  if (!['http', 'https'].includes(cfg.androidScheme)) bad('"androidScheme" must be "http" or "https"');
  if (!['default', 'portrait', 'landscape'].includes(cfg.orientation)) bad('"orientation" must be default, portrait or landscape');
  if (!/^#[0-9a-f]{6}$/i.test(cfg.backgroundColor)) bad('"backgroundColor" must look like #0f1115');
  if (typeof cfg.allowCleartext !== 'boolean') bad('"allowCleartext" must be true or false');
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
  for (const c of ['dist', 'build', 'www', 'public', 'docs']) {
    const p = path.join(WEB_DIR, c);
    if (fs.existsSync(path.join(p, 'index.html'))) return p;
  }
  if (fs.existsSync(path.join(WEB_DIR, 'index.html'))) return WEB_DIR;
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

function prepareWeb(cfg) {
  step('Preparing web content');
  fs.rmSync(WWW_DIR, { recursive: true, force: true });

  if (cfg.url) {
    log(`url is set -> app will load ${cfg.url} (web files are not bundled)`);
    copyDir(path.join(ROOT, 'placeholder'), WWW_DIR);
    return;
  }

  if (cfg.buildCommand) {
    log(`Running buildCommand in ${WEB_DIR}: ${cfg.buildCommand}`);
    const r = spawnSync(cfg.buildCommand, { shell: true, stdio: 'inherit', cwd: WEB_DIR });
    if (r.status !== 0) fail(`buildCommand failed (exit ${r.status})`);
  }

  const root = findWebRoot(cfg);
  if (!root) {
    warn('No index.html found in the web repo (looked in dist, build, www, public, docs and the repo root) - building with a placeholder page. Set "webDir" or "url" in app.json.');
    copyDir(path.join(ROOT, 'placeholder'), WWW_DIR);
    return;
  }
  warnIfBuildBased(cfg, root);
  log(`Bundling web files from ${root}`);
  const skipTop = new Set(['.git', '.github', 'node_modules', 'output', '.web2apk']);
  copyDir(root, WWW_DIR, (p) => root !== WEB_DIR || !skipTop.has(path.relative(root, p).split(path.sep)[0]));
}

export function writeCapacitorConfig(cfg) {
  const server = { androidScheme: cfg.androidScheme, cleartext: cfg.allowCleartext, allowNavigation: cfg.allowNavigation };
  if (cfg.url) server.url = cfg.url;
  const capCfg = {
    appId: cfg.appId,
    appName: cfg.appName,
    webDir: 'www',
    backgroundColor: cfg.backgroundColor,
    server,
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

  step('Creating fresh Android project');
  fs.rmSync(ANDROID_DIR, { recursive: true, force: true });
  run('npx', ['cap', 'add', 'android']);

  step('Generating launcher icons');
  run('npx', ['capacitor-assets', 'generate', '--android', '--iconBackgroundColor', cfg.backgroundColor, '--iconBackgroundColorDark', cfg.backgroundColor]);

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
