// Publica o app no site (branch gh-pages): é isso que faz o app instalado "achar a atualização".
// Uso: npm run deploy   (na pasta motion-editor, com o código já commitado)
// Monta www/ + version.json + app-update.zip, troca o conteúdo do gh-pages (mantém a pasta downloads/ com APK/EXE) e dá push.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (c, o = {}) => execSync(c, { stdio: 'inherit', ...o });
const out = (c, o = {}) => execSync(c, { encoding: 'utf8', ...o }).trim();

run('node tools/build-presets.mjs');
run('node tools/build-www.mjs');
run('node tools/make-update.mjs');

const ver = JSON.parse(fs.readFileSync('www/version.json', 'utf8'));
const remote = out('git remote get-url origin');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-pages-'));
run(`git clone --depth 1 --branch gh-pages "${remote}" "${tmp}"`);

for (const e of fs.readdirSync(tmp)) if (e !== '.git' && e !== 'downloads') fs.rmSync(path.join(tmp, e), { recursive: true, force: true });
fs.cpSync('www', tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');

run('git add -A', { cwd: tmp });
if (!out('git status --porcelain', { cwd: tmp })) { console.log(`Nada mudou: o site já está na ${ver.label}.`); process.exit(0); }
run(`git -c user.name="MotionFrame deploy" -c user.email="noreply@users.noreply.github.com" commit -q -m "deploy ${ver.label}"`, { cwd: tmp });
for (let i = 1; i <= 4; i++) {
  try { run('git push origin gh-pages', { cwd: tmp }); break; } catch (e) { if (i === 4) throw e; execSync(`sleep ${2 ** i}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nSite publicado: ${ver.label} → https://gabriel050413.github.io/Teste-AF-HUB/ (o app instalado atualiza sozinho em instantes)`);
