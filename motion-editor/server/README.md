# MotionFrame Cloud (servidor)

Servidor leve (Node 22, sem dependências) com: contas, pontos, mercado de presets, feed de edits, chat em tempo real, loja de pontos, encomendas (bounties) e backup de projetos na nuvem.

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
