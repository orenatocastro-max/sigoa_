# SIGOA + SIGC Integrado v1

## O que foi alterado
- SIGC integrado à base do SIGOA.
- Base única: `data/contratos.json` alimenta o cadastro de prestadores/instrumentos do SIGOA.
- Login de gestão incluído: `gestao` / `gestao123`.
- Perfil GESTAO consulta SIGOA e SIGC, sem alterar dados.
- Dashboard SIGOA simplificado com ✅ para escalas lançadas e ❌ para pendentes.
- Escalas agora possuem subitens por serviço, por exemplo:
  - Cirurgias: Ortopedia, Urologia e Cirurgia Geral.
  - Outros serviços recebem subitem principal ou quantitativo conforme o tipo.
- Ao clicar em escala, abre janela flutuante fixa para check ou quantitativo.
- SIGC com contratos em janela flutuante ao clicar no registro.

## Rodar localmente
```bash
npm install
npm start
```

Acesse:
```text
http://localhost:3000
```

## Logins
- Administrador: `admin` / `admin123`
- Operador: `operador` / `operador123`
- Auditor: `auditor` / `auditor123`
- Consulta: `consulta` / `consulta123`
- Gestão: `gestao` / `gestao123`

## Publicação
O projeto já está pronto para Render/Railway/servidor Node.js.
Use `npm start` como comando de inicialização.
