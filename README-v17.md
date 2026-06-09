# SIGOA v17 - Arquitetura modular

Esta versão reorganiza o SIGOA em três universos:

1. **Gestão de Contratos**
   - Cadastro completo do prestador: razão social, nome fantasia, CNPJ, CNES, município, endereço, responsável, telefone, e-mail e contato administrativo.
   - Cadastro do contrato/instrumento: número, natureza, vigência, valor global do contrato, modo de lançamento, anexos/links e observações.
   - Cadastro do rol de procedimentos somente pelo Administrador.

2. **Gestão de Escalas/Ofertas**
   - Operador lança apenas os quantitativos das unidades vinculadas.
   - O rol de procedimentos vem da Gestão de Contratos.
   - Dashboard mantém status de subescalas: completa, parcial ou pendente.

3. **Painel Rede Executora**
   - Mantém as funcionalidades atuais do painel externo.
   - Passa a buscar os dados da Gestão de Contratos.
   - Acrescenta o campo **Valor Global do Contrato**.
   - Exibe também o **Teto Físico Mensal**, quando definido.

## Perfis

- ADMINISTRADOR: acesso total.
- OPERADOR: lançamento de escalas/ofertas das unidades vinculadas.
- GESTAO: consulta gerencial interna.
- AUDITOR: relatórios e auditoria.

Usuários antigos com perfil `CONSULTA` são migrados automaticamente para `GESTAO` ao iniciar o servidor.

## Publicação

Substitua os arquivos no projeto atual e rode:

```bash
git add .
git commit -m "Versao v17 modular contratos escalas rede executora"
git push
```

Depois aguarde o Render fazer o deploy.
