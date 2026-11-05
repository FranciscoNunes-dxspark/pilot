// The installers: the setup program's script names the files the build makes, the install scripts
// parse (PowerShell's on Windows, sh elsewhere), and install.sh installs from a stand-in for GitHub's
// API (a local server), checking the checksum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetName, buildTargets } from '../src/kit/update.js';
import { autoUpdate } from '../src/web/server.js';

const dir = fileURLToPath(new URL('../installer/', import.meta.url));
const read = (f) => readFileSync(join(dir, f), 'utf8');
const windows = process.platform === 'win32';

test('the setup program: the files it packs are the ones the build makes', () => {
  const iss = read('Pilot.iss');
  assert.match(iss, new RegExp(`Source: "\\.\\.\\\\dist\\\\${assetName('win32', 'x64').replace('.', '\\.')}"; DestDir: "\\{app\\}"; DestName: "pilot\\.exe"`));
  assert.match(iss, /OutputBaseFilename=pilot-windows-x64-setup/);
  assert.ok(existsSync(fileURLToPath(new URL('../assets/logo.ico', import.meta.url))));
  // Per user, on the user's PATH, never needing an administrator.
  assert.match(iss, /PrivilegesRequired=lowest/);
  assert.match(iss, /ChangesEnvironment=yes/);
  // Interrupted updates leave .pilot-update-* folders, which uninstalling removes.
  assert.match(iss, /\{app\}\\\.pilot-update-\*/);
  assert.match(read('build.ps1'), /Pilot\.iss/);
});

test('the install scripts name the release files the build makes', () => {
  const files = Object.values(buildTargets('pilot'));
  for (const [os, arch] of [['linux', 'x64'], ['linux', 'arm64'], ['macos', 'x64'], ['macos', 'arm64']]) assert.ok(files.includes(`pilot-${os}-${arch}`));
  assert.match(read('install.ps1'), new RegExp(`\\$File = '${assetName('win32', 'x64').replace('.', '\\.')}'`));
});

test('the PowerShell scripts avoid what Windows PowerShell misreads, on every system', () => {
  for (const f of ['install.ps1', 'build.ps1']) {
    const text = read(f);
    // Without a BOM, Windows PowerShell 5.1 reads a script as the ANSI code page: UTF-8's dashes and
    // quotes turn into quote characters there.
    assert.ok(!/[^\x00-\x7f]/.test(text), `${f} is ASCII only`);
    // "$exe: ..." is a scope or drive prefix (like $env:) to PowerShell, and a syntax error: "${exe}: ...".
    for (const m of text.matchAll(/\$([A-Za-z_]\w*):(?![A-Za-z_])/g)) assert.fail(`${f}: $${m[1]}: needs braces`);
  }
});

test('the PowerShell scripts parse', { skip: !windows && 'PowerShell is checked on Windows' }, () => {
  for (const f of ['install.ps1', 'build.ps1']) {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${join(dir, f)}', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' });
    assert.equal(out.trim(), '0', `${f} has syntax errors`);
  }
});

test('install.sh installs the newest release, checked, and refuses a bad checksum', { skip: windows && 'sh is checked on Linux and macOS' }, async () => {
  assert.equal(spawnSync('sh', ['-n', join(dir, 'install.sh')]).status, 0);
  const os = process.platform === 'darwin' ? 'macos' : 'linux';
  const arch = ['arm64', 'aarch64'].includes(process.arch) ? 'arm64' : 'x64';
  const file = `pilot-${os}-${arch}`;
  const binary = '#!/bin/sh\necho 9.9.9\n';
  let checksum = createHash('sha256').update(binary).digest('hex');
  // GitHub's release downloads: the newest under latest/download, a version under download/v<version>.
  const asked = [];
  const server = createServer((req, res) => {
    asked.push(req.url);
    const m = /^\/releases\/(?:latest\/download|download\/v9\.9\.[89])\/(.+)$/.exec(req.url);
    if (m?.[1] === file) return res.end(binary);
    if (m?.[1] === 'SHA256SUMS.txt') return res.end(`${checksum}  ${file}\n${'0'.repeat(64)}  other\n`);
    res.writeHead(404).end('Not Found');
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const home = mkdtempSync(join(tmpdir(), 'pilot-install-'));
  const env = { ...process.env, HOME: home, PILOT_INSTALL_BASE: `http://127.0.0.1:${server.address().port}`, PILOT_INSTALL_DIR: join(home, 'bin') };
  try {
    const r = await sh([join(dir, 'install.sh')], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Downloading pilot-\w+-\w+ from the newest release/);
    assert.equal(readFileSync(join(home, 'bin', 'pilot'), 'utf8'), binary);
    assert.deepEqual(asked, [`/releases/latest/download/${file}`, '/releases/latest/download/SHA256SUMS.txt']);
    // A version asked for.
    const v = await sh([join(dir, 'install.sh'), '9.9.8'], env);
    assert.equal(v.status, 0, v.stderr);
    assert.match(v.stdout, /from v9\.9\.8/);
    assert.equal(asked.at(-1), '/releases/download/v9.9.8/SHA256SUMS.txt');
    // A version that isn't there.
    const none = await sh([join(dir, 'install.sh'), '1.0.0'], env);
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /couldn't download pilot-\w+-\w+ from v1\.0\.0/);
    // A download that doesn't match its checksum is never installed.
    checksum = '1'.repeat(64);
    rmSync(join(home, 'bin', 'pilot'));
    const bad = await sh([join(dir, 'install.sh')], env);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /doesn't match its checksum/);
    assert.ok(!existsSync(join(home, 'bin', 'pilot')), 'nothing installed');
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

/** sh with `args`, without blocking (the stand-in server runs in this process): { status, stdout, stderr }. */
function sh(args, env) {
  return new Promise((ok) => {
    const child = spawn('sh', args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => ok({ status, stdout, stderr }));
  });
}

test('a checkout never updates itself', async () => {
  const said = [];
  await autoUpdate((s) => said.push(s));
  assert.deepEqual(said, []);
});
