import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const TOK = process.env.MF_TOKEN || ''; // token de acesso do aparelho de teste (não fica no repositório)
const D = process.env.CALIB_DIR || './';
const presets = JSON.parse(process.env.PRESETS || '{"wdzik":"/home/user/motion-ref/cc/wdzik.ffx"}');
const tune = process.env.TUNE ? JSON.parse(process.env.TUNE) : null;
const b=await chromium.launch(); const pg=await (await b.newContext({ serviceWorkers: 'block' })).newPage(); // sem SW: a 1ª instalação recarrega a página no meio do teste
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('http://localhost:8795/',{waitUntil:'load'}); await pg.waitForTimeout(2500);
await pg.evaluate(t=>{localStorage.setItem('motionframe.device','GZVZB57JNT175D52');localStorage.setItem('motionframe.token',t);},TOK);
await pg.reload({waitUntil:'load'}); await pg.waitForTimeout(3000); await pg.waitForFunction(()=>window.motionframe);

for (const [name, file] of Object.entries(presets)) {
  const b64 = fs.readFileSync(file).toString('base64'); const img = 'data:image/png;base64,' + fs.readFileSync(D + `in_${name.replace(/Main|Aep/,'')}.png`).toString('base64');
  const out = await pg.evaluate(async ({ img, b64, name, tune }) => {
    globalThis.__MF_TUNE = tune || undefined;
    const st = await import('/js/state.js'); const pr = await import('/js/presets.js'); const fx = await import('/js/ffx.js'); const rd = await import('/js/renderer.js');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed = fx.parseFFX(bin.buffer); const preset = pr.ffxToPreset(parsed, name);
    const p = st.createProject(512, 512); p.background = '#000000';
    const l = st.LAYER_FACTORIES.image(p, img, 512, 512, 'orig'); p.layers = [l];
    pr.applyPreset(l, preset, 0, 30);
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const x = c.getContext('2d');
    const im = new Image(); im.src = img; await im.decode();
    for (let i = 0; i < 4; i++) { rd.renderFrame(x, p, 0.5, 1, { final: true }); await new Promise((r) => setTimeout(r, 150)); }
    return c.toDataURL('image/png');
  }, { img, b64, name, tune });
  fs.writeFileSync(`${D}mf_${name}.png`, Buffer.from(out.split(',')[1], 'base64'));
}
await b.close();
