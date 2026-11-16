# MotionFrame Cloud (servidor)

Servidor leve (Node 22, sem dependências) com: contas, pontos, mercado de presets, feed de edits, chat em tempo real, loja de pontos, encomendas (bounties) e backup de projetos na nuvem.

## Publicar com 1 clique (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gabriel050413/Teste-AF-HUB/tree/claude/brave-mccarthy-867880)

1. Clique no botão, entre no Render com a conta do GitHub e confirme o blueprint (`render.yaml` na raiz do repositório).
2. Quando pedir `ANTHROPIC_API_KEY`, cole a chave da IA (crie em console.anthropic.com › API Keys) ou deixe vazio para usar o gerador automático de paletas.
3. Copie o endereço do serviço (ex.: `https://motionframe-cloud.onrender.com`) e, no GitHub: Settings › Secrets and variables › Actions › Variables › `MF_CLOUD_URL` = esse endereço. O próximo deploy do site cria o `cloud.json` e o app conecta sozinho.
4. A `ADMIN_KEY` gerada fica nas variáveis do serviço no Render (use para dar pontos: `POST /api/admin/grant`).

O blueprint usa o plano Starter com disco de 5 GB (o banco e os vídeos ficam em `/data`). No plano grátis o servidor funciona, mas apaga os dados quando reinicia.

## Rodar

    cd motion-editor
    ADMIN_KEY=troque-isto STATIC_DIR=. node server/index.mjs     # http://localhost:8787 (serve o app também)

Variáveis: `PORT`, `HOST`, `DATA_DIR` (banco SQLite + mídias), `PUBLIC_KEY` (chave pública do gerador de tokens; padrão = a do app), `ADMIN_KEY`, `DEFAULT_POINTS` (pontos de tokens sem pontos definidos, padrão 100), `FEE_PCT` (% retido pela plataforma em cada venda, padrão 0), `MAX_UPLOAD_MB`, `CORS_ORIGIN`, `SESSION_SECRET`.

Docker: `docker build -t motionframe-cloud -f server/Dockerfile . && docker run -p 8787:8787 -v mf:/data -e ADMIN_KEY=... motionframe-cloud`.

## Conectar o app

O app procura o servidor em: ajuste do usuário (Perfil › Servidor) › `cloud.json` do site (`{"api":"https://seu-servidor"}`) › o próprio endereço do app. O site no GitHub Pages precisa de um `cloud.json` apontando para o servidor hospedado (é estático: o servidor não roda no Pages).

## Contas e pontos

- Só entra quem tem **token de acesso** válido (assinado pelo gerador). O token pode trazer os **pontos iniciais** (`tools/token-gen`, campo "pontos"; vazio = `DEFAULT_POINTS`).
- Criar conta: e-mail, usuário, senha e foto. Um token = uma conta.
- Dar pontos: `POST /api/admin/grant` com cabeçalho `x-admin-key` e `{ "username": "...", "amount": 100 }`.
- Vendas: quem vende recebe o preço (menos `FEE_PCT`); quem compra paga. Gorjetas, bônus diário, encomendas com pontos em custódia e loja (destaque, impulso, selos, molduras, exportações sem marca d'água, pacotes de IA, vagas de nuvem).

## Segurança (v1.0.0 BETA TEST)
- A comunidade (contas, feed, mercado, chat, IA de interface) fica **desligada** por padrão: só `/api/health` responde. Para ligar: `COMMUNITY=1`.
- `ADMIN_KEY` precisa ter 16+ caracteres (comparação em tempo constante); chave curta = admin desligado.
- Limite geral por IP (`IP_MAX_PER_MIN`, padrão 600/min) além dos limites de login/cadastro e escrita.
- Atrás de proxy (Render): `TRUST_PROXY=1` (automático no Render) usa o IP informado pelo proxy; fora disso o `X-Forwarded-For` é ignorado.
- Cabeçalhos: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS no Render (`HSTS=1`).
- O servidor de arquivos nunca entrega arquivos ocultos (`.env`, `.git`), `server/`, `data/`, `tests/`, `tools/`, bancos `.db`.
