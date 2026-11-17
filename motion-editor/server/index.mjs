// Inicia o MotionFrame Cloud. Configuração por variáveis de ambiente (veja server/README.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const dataDir = env.DATA_DIR || path.join(here, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const app = createApp({
  dbPath: env.DB_PATH || path.join(dataDir, 'motionframe.db'),
  publicKey: env.PUBLIC_KEY || undefined,      // chave pública do gerador de tokens (padrão: a de js/access.js)
  adminKey: env.ADMIN_KEY || '',               // chave do dono para dar pontos (POST /api/admin/grant)
  defaultPoints: env.DEFAULT_POINTS != null ? Number(env.DEFAULT_POINTS) : 100, // pontos de quem tem token sem pontos definidos
  feePct: Number(env.FEE_PCT || 0),            // % do preço que a plataforma retém em cada venda (0 = vendedor leva tudo)
  maxUploadMB: Number(env.MAX_UPLOAD_MB || 40),
  corsOrigin: env.CORS_ORIGIN || '*',
  sessionSecret: env.SESSION_SECRET || undefined,
  aiCost: Number(env.AI_UI_COST || 25),          // pontos por interface gerada pela IA
  anthropicKey: env.ANTHROPIC_API_KEY || '',     // sem chave: gerador procedural
  staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : '',
  community: env.COMMUNITY === '1',              // comunidade desligada por padrão nesta versão beta (COMMUNITY=1 liga)
  trustProxy: env.TRUST_PROXY === '1' || !!env.RENDER, // atrás de proxy confiável (Render): usa o IP que o proxy informa
  hsts: env.HSTS === '1' || !!env.RENDER,
  ipMax: Number(env.IP_MAX_PER_MIN || 600),
});

const port = await app.listen(Number(env.PORT || 8787), env.HOST || '0.0.0.0');
console.log(`MotionFrame Cloud no ar: http://localhost:${port}  (banco: ${app.cfg.dbPath})`);
if (!app.cfg.adminKey || app.cfg.adminKey.length < 16) console.log('Dica: defina ADMIN_KEY (16+ caracteres) para poder dar pontos a usuários.');
if (!app.cfg.community) console.log('Comunidade desligada (defina COMMUNITY=1 para ligar).');
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); process.exit(0); });
