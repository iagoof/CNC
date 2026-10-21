import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let cli;
try { cli = require.resolve('firebase-tools/lib/bin/firebase.js'); }
catch {
  console.error('PENDENTE: Firebase CLI não está instalado neste projeto. Instale firebase-tools como dependência de desenvolvimento para executar o emulador oficial. Nenhum teste de regras foi executado.');
  process.exit(1);
}
const homes = [process.env.JAVA_HOME].filter(Boolean);
if (process.platform === 'win32') {
  for (const folder of ['C:/Program Files/Eclipse Adoptium', 'C:/Program Files/Java']) {
    if (existsSync(folder)) homes.push(...readdirSync(folder).filter(name => /(?:jdk|jre)-?21\b/.test(name)).map(name => join(folder, name)));
  }
}
let javaHome;
for (const home of homes) {
  const result = spawnSync(join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), ['-version'], { encoding: 'utf8', windowsHide: true });
  if (Number((result.stderr || result.stdout || '').match(/version "(\d+)/)?.[1]) >= 21) { javaHome = home; break; }
}
if (!javaHome) {
  const result = spawnSync('java', ['-version'], { encoding: 'utf8', windowsHide: true });
  const version = Number((result.stderr || result.stdout || '').match(/version "(\d+)/)?.[1]);
  if (!Number.isFinite(version) || version < 21 || result.status !== 0 || result.error) {
    console.error('PENDENTE: configure JAVA_HOME com Java 21 ou superior. Nenhum teste de regras foi executado.');
    process.exit(1);
  }
}
const env = { ...process.env, GCLOUD_PROJECT: 'demo-cnc-rules', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' };
if (javaHome) { env.JAVA_HOME = javaHome; env.PATH = `${join(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${env.PATH || ''}`; }
// The demo project and loopback-only config are fixed. No production config,
// service account, Firebase login or deployment command is used by this runner.
const result = spawnSync(process.execPath, [cli, 'emulators:exec', '--config', 'firebase.test.json', '--project', 'demo-cnc-rules', '--only', 'firestore', `"${process.execPath}" --test tests/firestore-rules.test.mts`], {
  cwd: root, env, stdio: 'inherit', windowsHide: true
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
