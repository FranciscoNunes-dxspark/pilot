// Compiles Pilot into standalone executables with Bun (no Node needed to run them), as `npm run build`
// does:
//   bun scripts/build.js                  this machine's platform
//   bun scripts/build.js --all            every release target
//   bun scripts/build.js bun-linux-x64    specific targets
// The version comes from package.json (the Release workflow writes the release's there first) and is
// baked in as PILOT_VERSION, which src/app.js reads. Output goes to dist/pilot-<platform>[.exe], the
// names the updater and the install scripts look for.
import { readFileSync } from 'node:fs';
import { versionVariable } from '../src/kit/app.js';
import { buildTargets } from '../src/kit/update.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const TARGETS = buildTargets('pilot');
const args = process.argv.slice(2);
const here = `bun-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const targets = args.includes('--all') ? Object.keys(TARGETS) : args.length ? args : [here];

for (const target of targets) {
  if (!TARGETS[target]) throw new Error(`Unknown target ${target}. Known: ${Object.keys(TARGETS).join(', ')}`);
  const outfile = `dist/${TARGETS[target]}`;
  // The logo as the .exe icon: Bun can only write it when building on Windows, so CI builds that target there.
  const windows = target.includes('windows') && process.platform === 'win32' ? { icon: 'assets/logo.ico', title: 'Pilot' } : undefined;
  const result = await Bun.build({
    entrypoints: ['bin/pilot.js'],
    compile: { target, outfile, windows },
    minify: true,
    // Each dynamic import its own chunk inside the executable: what a command doesn't use is never parsed.
    splitting: true,
    define: { [`process.env.${versionVariable('pilot')}`]: JSON.stringify(pkg.version), 'process.env.NODE_ENV': '"production"' },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`${target} → ${outfile}`);
}
