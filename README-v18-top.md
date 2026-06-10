# SIGOA v18 Top – Gestão de Contratos + Escalas + Rede Executora

Esta versão reorganiza o SIGOA para uso profissional:

- Dashboard executivo com alertas de contratos vencidos e próximos do vencimento.
- Gestão de Contratos com visual SIGC, filtros, tabela profissional e modal flutuante.
- Destaque visual:
  - 🟥 Vencido
  - 🟧 Vencendo em até 90 dias
  - 🟩 Vigente
  - ⚪ Sem vigência
- Cadastro completo da empresa/prestador: razão social, nome fantasia, CNPJ, CNES, município, contato, telefone, e-mail e endereço.
- Contrato: número, processo, valor global, vigência, natureza, modo de lançamento e anexos/links.
- Separação correta:
  - Rol de procedimentos: aparece na Rede Executora.
  - Subescalas: aparecem para o operador lançar mensalmente.
- Gestão de Escalas/Ofertas usando subescalas, não o rol de procedimentos.
- Rede Executora permanece externa e continua usando a base contratual, com valor global do contrato.

## Depois de substituir os arquivos

```bash
git add .
git commit -m "Versao v18 top contratos e subescalas"
git push
```

Depois aguarde o Render finalizar o deploy e teste:

- `/sigoa/`
- `/rede-executora/`
