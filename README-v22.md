# SIGOA v22 - Painel Executivo limpo e Rede Executora corrigida

## Principais ajustes

- Painel Executivo com visão resumida, sem excesso de cards.
- Panorama da Rede Assistencial com unidades executantes, serviços ativos, municípios cobertos e contratos vigentes.
- Resumo por natureza: Rede própria, contratualizada, contrato de gestão, pactuação etc.
- Remoção do menu/painel separado de escalas; as escalas aparecem diretamente no Painel Executivo em lista/tabela.
- Contratos a vencer aparecem em pop-up ao logar, apenas uma vez por sessão.
- Contratos vigentes corrigidos: contratos a vencer continuam sendo contados como vigentes.
- Cadastro de prestador/contrato em janela flutuante/modal.
- Máscara monetária para valor global do contrato.
- Documentos/anexos com links clicáveis no detalhe do contrato.
- Tipo de monitoramento com opção: Quantitativo mensal, Escala/Subescala e Apenas contratual.
- Serviços "Apenas contratual" não entram como pendentes no dashboard de escalas.
- Rede Executora com busca direta por procedimento na tela inicial.
- Mapa mantém destaque de municípios com serviços cadastrados.
- Rol de procedimentos em tabela/lista simples, sem chips/cards.

## Como publicar

```bash
git add .
git commit -m "Versao v22 painel executivo e rede executora corrigida"
git push
```

Depois aguarde o deploy automático no Render.
