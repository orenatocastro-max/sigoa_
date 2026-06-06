# SIGOA - Publicação Final

Sistema de Gestão da Oferta Assistencial com Painel da Rede Executora integrado.

## Rodar localmente

```bash
npm install
npm start
```

Acesse:

- SIGOA: http://localhost:3000/sigoa/
- Rede Executora: http://localhost:3000/rede-executora/

## Logins iniciais

- admin / admin123
- operador / operador123
- auditor / auditor123
- consulta / consulta123

## Publicar no Render

1. Suba esta pasta para um repositório no GitHub.
2. No Render, crie um **New Web Service**.
3. Selecione o repositório.
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Adicione as variáveis de ambiente:
   - `SESSION_SECRET`: uma chave grande qualquer
   - `PUBLIC_API_KEY`: `REDE_EXECUTORA_2026` ou outra chave de sua escolha

## Rotas principais

- `/sigoa/` - sistema mestre de cadastro e oferta.
- `/rede-executora/` - painel de consulta.
- `/api/public/rede-executora?mes=2026-06` - API protegida por chave.

## Regra da Rede Executora

Procedimentos sem oferta aparecem como `-`, nunca como `0`.

## Observação importante sobre Render

Em serviços gratuitos, arquivos JSON podem ser perdidos em redeploy/restart dependendo da configuração. Para produção real, use um **Persistent Disk** no Render ou migre para PostgreSQL quando necessário.
