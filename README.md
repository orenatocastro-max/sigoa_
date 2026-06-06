# SIGOA Profissional Seguro - PostgreSQL/Supabase

Versão profissional do SIGOA com:

- SIGOA administrativo com cadastro, oferta mensal, auditoria, usuários e relatórios completos.
- Painel Rede Executora somente consulta.
- Banco PostgreSQL/Supabase quando `DATABASE_URL` estiver configurada.
- Fallback para JSON local apenas para teste/desenvolvimento.
- Cadastros auxiliares editáveis: municípios, tipos de serviço, naturezas, tipos de instrumento, motivos de bloqueio, grupos e situações.
- Listas nos formulários para padronizar município, tipo de serviço, natureza e motivo.
- Health check em `/api/health`.

## 1. Instalar no computador

Dentro da pasta do projeto:

```bash
npm install
npm start
```

Acesse:

- SIGOA: http://localhost:3000/sigoa/
- Rede Executora: http://localhost:3000/rede-executora/
- Teste do banco: http://localhost:3000/api/health

Logins iniciais:

- admin / admin123
- operador / operador123
- auditor / auditor123
- consulta / consulta123

## 2. Criar banco no Supabase

1. Entre em https://supabase.com
2. Crie um projeto chamado `SIGOA`.
3. Guarde a senha do banco.
4. A sua conexão será neste formato:

```text
postgresql://postgres:SUA_SENHA@db.ID_DO_PROJETO.supabase.co:5432/postgres
```

No seu caso, pelo projeto que você criou anteriormente, o ID era parecido com:

```text
kngyibsjnufyiosfyzew
```

Então ficaria:

```text
postgresql://postgres:SUA_SENHA@db.kngyibsjnufyiosfyzew.supabase.co:5432/postgres
```

Troque `SUA_SENHA` pela senha real do banco.

## 3. Configurar no Render

No serviço `sigoa`, vá em **Environment** e adicione:

```text
NODE_ENV=production
SESSION_SECRET=coloque_uma_chave_grande_e_dificil_aqui
PUBLIC_API_KEY=REDE_EXECUTORA_2026
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.kngyibsjnufyiosfyzew.supabase.co:5432/postgres
```

Depois faça deploy.

## 4. Como saber se está salvando no banco

Abra:

```text
https://sigoa.onrender.com/api/health
```

Resultado correto com banco:

```json
{"ok":true,"storage":"postgres"}
```

Se aparecer `storage: json`, a `DATABASE_URL` não foi configurada ou está incorreta.

## 5. Como publicar no GitHub/Render

Depois de substituir os arquivos:

```bash
git add .
git commit -m "Versao profissional segura com banco e listas auxiliares"
git push
```

O Render fará o deploy automaticamente.

## 6. Observações importantes

- A Rede Executora é apenas consulta.
- Cadastro, edição, bloqueio e lançamento de oferta ficam no SIGOA administrativo.
- A tabela `sigoa_store` é criada automaticamente no PostgreSQL na primeira inicialização.
- Os dados iniciais dos JSON são copiados para o banco automaticamente quando a tabela ainda está vazia.
- Depois que o banco estiver funcionando, o PostgreSQL/Supabase passa a ser a fonte principal dos dados.
