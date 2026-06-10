# SIGOA/SIGC v22.2 — versão pronta para banco

## Principais ajustes

- Painel Executivo mais limpo.
- Gestão de Contratos com modal de cadastro.
- Documentos contratuais por tipo:
  - Contrato Principal
  - Termo de Referência
  - Ordem de Serviço
  - Termo Aditivo
  - Notificação
  - Outros
- Links/documentos clicáveis no modal do contrato.
- Unidade executora clicável no Dashboard de Escalas.
- Botões padronizados: 💾 Salvar Alterações e ❌ Cancelar.
- Mensagem visual: alterações salvas com sucesso.
- Mapa da Rede Executora com municípios ofertantes destacados.
- Busca por procedimento/código SIGTAP na Rede Executora.
- Base SIGTAP única com importação TXT.
- Preparado para PostgreSQL/Supabase por DATABASE_URL.

## Variáveis no Render

Configure em Environment:

NODE_ENV=production
SESSION_SECRET=uma_chave_grande_e_segura
PUBLIC_API_KEY=REDE_EXECUTORA_2026
DATABASE_URL=postgresql://postgres:SUA_SENHA@db.SEUPROJETO.supabase.co:5432/postgres

## Teste do banco

Após publicar, acesse:

/api/health

Se aparecer storage: postgres, está usando PostgreSQL/Supabase.

## Observação sobre anexos

Nesta versão, o sistema salva os metadados e links/caminhos dos documentos no banco. Para armazenamento real dos arquivos, recomenda-se usar Supabase Storage, Google Drive institucional ou bucket S3/R2, mantendo o link registrado no contrato.
