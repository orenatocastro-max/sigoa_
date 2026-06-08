# SIGOA v11 — vínculo operador/prestador e controle de escala

Principais ajustes:

- Vinculação de prestadores/unidades ao usuário operador.
- Operador visualiza e lança oferta apenas dos prestadores vinculados.
- Administrador pode editar vínculos em Usuários > Vincular prestadores.
- Ao salvar a oferta mensal, o sistema sinaliza automaticamente a escala como lançada.
- Tela "Escalas do mês" com prestadores lançados e pendentes.
- Dashboard com escalas lançadas, pendentes e total por prestador.
- Relatório "Escalas lançadas/pendentes".
- Campo de total consolidado da oferta mensal do prestador, somando todos os procedimentos lançados na competência.

Instalação:

1. Substitua os arquivos do projeto atual por esta versão.
2. Rode:

```bash
git add .
git commit -m "Adiciona vinculo operador prestador e controle de escalas"
git push
```

3. Aguarde o Render concluir o deploy.
4. Acesse o SIGOA, entre como administrador e vincule os prestadores aos operadores em Usuários.
