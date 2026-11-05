// Who this app is, for src/kit: its name in release files and messages, and its version, baked into
// a build as process.env.PILOT_VERSION by scripts/build.js. Import
// VERSION and COMPILED from here; the entry point imports it first.
import { configureApp } from './kit/app.js';

export const APP = configureApp({
  name: 'pilot',
  title: 'Pilot',
  version: process.env.PILOT_VERSION,
  packageUrl: new URL('../package.json', import.meta.url),
});

export const { VERSION, COMPILED } = APP;
export default APP;
