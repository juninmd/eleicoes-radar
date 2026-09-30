# Radar do Voto 2026

Painel técnico para comparar candidaturas das eleições de 4/10/2026 com dados oficiais.
Não recomenda votos: o eleitor escolhe o peso de cada indicador.

## Rodar

```sh
bun install
bun run radar:fetch     # baixa os arquivos da Câmara (idempotente; --force atualiza)
bun run radar:polls     # pesquisas da Wikipédia -> data/pesquisas.json (cache diário; --force atualiza)
bun run radar:model     # treina o modelo de deputados em 2022 -> data/modelo-deputados.json
bun run radar:profiles  # trajetória e fotos de reserva (Câmara, Senado, Wikidata)
bun run radar:build     # gera web/data/ (uf/<UF>.json, fotos/, expectativa.json, meta.json)
bun run radar:serve     # http://127.0.0.1:4173  (health: /health)
bun test src/radar web
```

### Passo manual: TSE

O TSE bloqueia alguns clientes automáticos (403 do WAF); `curl -A "Mozilla/5.0" -O <url>` funcionou em 2026-09-29. Se falhar, baixe no navegador (URLs em
`https://cdn.tse.jus.br/estatistica/sead/odsele/...`) e salve em `data/tse/`:

- `bem_candidato_2026.zip` (patrimônio declarado), `motivo_cassacao_2026.zip` (fundamentos de indeferimento),
  `consulta_cand_2026.zip` (cadastro), `prestacao_de_contas_eleitorais_candidatos_2026.zip` (contas),
  `consulta_vagas_2026.zip` (vagas por cargo), `foto_cand2026_<UF>_div.zip` (fotos, uma por UF + `BR`)
- Para a variação de patrimônio: `bem_candidato_2022.zip`
- Para o modelo de deputados: `consulta_cand_2022.zip` e `prestacao_de_contas_eleitorais_candidatos_2022.zip`

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
| Resumo biográfico | Wikipédia (via link do Wikidata já validado por nome) |

Links de redes sociais só entram se forem https de hosts conhecidos. Caches em `data/extra/`.

## Indicadores

| Indicador | Fonte | Grupo de comparação |
|---|---|---|
| Redução de impostos / Liberdade econômica / Liberdade de expressão | Parcela de votos alinhados nas votações de `src/radar/agenda.json` (valor absoluto, não percentil) | — |
| Presença em votações | Votações nominais do plenário × histórico de exercício | Deputados que concorrem |
| Projetos aprovados | PL/PLP/PEC de autoria principal aprovados na Câmara ou virados lei | Deputados que concorrem |
| Economia na cota | Média mensal da CEAP | Deputados do mesmo estado |
| Renovação / Experiência | Status de mandato federal: estreante 1 · ex-suplente 0,67 · muda de cargo 0,33 · reeleição 0 (Experiência = inverso). Sem dado para governador, presidente e deputado estadual | — |
| Base de doadores | Doadores pessoa física distintos | Mesma disputa (cargo + UF) |
| Dinheiro diversificado | 1 − participação da maior fonte única | Mesma disputa |
| Voto independente | Votos contra a orientação do próprio partido | Deputados que concorrem |

Cada indicador vira um percentil de 0 a 1. A nota é a média ponderada pelos pesos do usuário.
Indicador ausente conta como 0,5, para que evidência parcial não supere um histórico completo.

## Expectativa (quem deve vencer)

- **Presidente, governador, senador:** pesquisas registradas no TSE, compiladas nas páginas
  "Pesquisas eleitorais ... 2026" da Wikipédia (`src/radar/polls/`). Só entram cenários reais: todo
  nome com percentual precisa ser candidatura registrada na disputa. Média da pesquisa mais recente de
  cada instituto nos últimos 21 dias (meia-vida 10 dias, peso √amostra), em votos válidos.
  20 mil simulações com erro amostral + 3,5 p.p. de erro sistemático; 2º turno usa confronto direto
  quando existe. Senado elege os 2 mais votados (vagas de `consulta_vagas_2026`).
- **Deputados:** sem pesquisa pública por candidato. Regressão logística treinada em 2022 com dados de
  7 dias antes da eleição (arrecadação escalada pelas vagas, força da lista partido/federação, posição
  na lista, ocupação declarada "deputado"), ajustada para somar as vagas de cada UF e recalibrada
  (isotônica). Validação cruzada por UF: acerta 58% dos eleitos contra 49% de "top-N por dinheiro".
- Não é pesquisa eleitoral e não substitui uma; a interface diz isso junto de cada número.

## Deploy

Imagem `ghcr.io/juninmd/eleicoes-radar` (`Dockerfile`: só `web/` + `serve.ts`), servida em
`https://eleicoes-radar.antonio-code.duckdns.org` via `juninmd/app-charts/eleicoes-radar` (ArgoCD).
`web/data` vem dos arquivos do TSE, que não estão no git, então a imagem é construída na máquina
que rodou o pipeline:

```sh
bun run radar:build && bun test src/radar web
docker build --platform linux/amd64 -t ghcr.io/juninmd/eleicoes-radar:$(git rev-parse --short HEAD) -t ghcr.io/juninmd/eleicoes-radar:latest .
docker push ghcr.io/juninmd/eleicoes-radar:latest   # o Deployment usa :latest + imagePullPolicy Always
kubectl -n apps rollout restart deploy/eleicoes-radar
```

Rollback: `docker push` da tag anterior como `:latest` e `rollout restart`. Saúde: `GET /health`.

## Decisões e limites

- **Cruzamento TSE × Câmara por CPF** (cadastro do TSE × cota parlamentar), com nome civil + UF como
  reserva. O CPF só é usado como chave e nunca vai para o JSON público.
- **Sem CPF nem identidade de doador no JSON público** (há teste de regressão para isso).
- **Presença** usa `/deputados/{id}/historico` para descontar licenças. Líderes que só orientam têm presença medida menor.
- **Cobertura**: todas as candidaturas do cadastro do TSE. Mandatos no Senado e nas assembleias estaduais
  ainda não entram nos indicadores.
- `src/*.ts` (fora de `src/radar`) e `dashboard/` são a versão anterior (ranking de "fraude" de deputados de SP),
  mantidos sem alteração.
