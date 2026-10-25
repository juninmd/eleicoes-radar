# Dados: download do TSE e fontes de enriquecimento

Volta para o [README](../README.md). A ordem completa do pipeline está no bloco **Desenvolver** do README; armadilhas de cada fonte, no [AGENTS.md](../AGENTS.md).

## Passo manual: TSE

O TSE bloqueia alguns clientes automáticos (403 do WAF); `curl -A "Mozilla/5.0" -O <url>` funcionou em 2026-09-29. Se falhar, baixe no navegador (URLs em
`https://cdn.tse.jus.br/estatistica/sead/odsele/...`) e salve em `data/tse/`:

- `bem_candidato_2026.zip` (patrimônio declarado), `motivo_cassacao_2026.zip` (fundamentos de indeferimento),
  `consulta_cand_2026.zip` (cadastro), `prestacao_de_contas_eleitorais_candidatos_2026.zip` (contas),
  `consulta_vagas_2026.zip` (vagas por cargo), `foto_cand2026_<UF>_div.zip` (fotos, uma por UF + `BR`)
- Para a variação de patrimônio: `bem_candidato_2022.zip`
- Para o modelo de deputados (2014, 2018 e 2022): `consulta_cand_<ano>`, `consulta_vagas_<ano>`, `votacao_candidato_munzona_<ano>`, `votacao_partido_munzona_<ano>` e as contas (`prestacao_final_2014`, `prestacao_de_contas_eleitorais_candidatos_2018` e `_2022`); URLs no AGENTS.md

Depois rode `bun run radar:build` de novo. Outro caminho: `TSE_ZIP=caminho.zip bun run radar:build`.

## Fontes de enriquecimento (sem API key)

Não entram na nota; aparecem no dossiê de cada candidatura.

| Bloco do dossiê | Fonte |
|---|---|
| Patrimônio declarado e variação vs 2022 (nominal) | TSE `bem_candidato` 2026 e 2022 (2022 ligado por CPF, ou nome civil + nascimento) |
| Situação do registro (fundamentos de indeferimento/impugnação, "para conferir") | TSE `motivo_cassacao` |
| Estado civil, coligação | TSE `consulta_cand` |
| Comissões, frentes, discursos, redes sociais, escolaridade | API de dados abertos da Câmara (`radar:profiles`) |
| Comissões no Senado | API de dados abertos do Senado (`radar:profiles`) |
| Principais fornecedores (CNPJ, situação, endereço, outros políticos atendidos, sinais "para conferir") | TSE despesas de campanha + CEAP + Receita Federal |
| Aba Rede (grafo partidos ↔ fornecedores; rede de um candidato) | mesmas fontes de fornecedores |
| Resumo biográfico | Wikipédia (via link do Wikidata já validado por nome) |

Links de redes sociais só entram se forem https de hosts conhecidos. Caches em `data/extra/`.
