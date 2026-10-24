# Método: indicadores, Expectativa e Panorama

Volta para o [README](../README.md). Backtests e calibração medidos, no [AGENTS.md](../AGENTS.md) (seção "Expectativa: dados históricos, backtests e calibração").

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
  20 mil simulações com erro amostral + erro sistemático medido nas eleições de 2014, 2018 e 2022 (126 disputas;
  `erroSistematico` para a chance de vitória e `erroFaixa` para a faixa de 90%, ambos em `PARAMS`); o chute inicial
  de 3,5 p.p. deixava a faixa de 90% cobrir só 64% dos resultados. Misturar o resultado da eleição anterior à média
  das pesquisas foi testado e não melhora (AGENTS.md). 2º turno usa confronto direto
  quando existe. Senado elege os 2 mais votados (vagas de `consulta_vagas_2026`).
  Cada candidato também traz a **tendência** (média de agora menos a média só com pesquisas de 14+ dias
  antes, com a referência a no máximo 21 dias da pesquisa mais nova, senão sem tendência; menos de 0,5 p.p. é "estável"). Os parâmetros (janela, meia-vida, erro, simulações) saem de
  `PARAMS` em `polls/forecast.ts` para `expectativa.json` (`metodo`): a interface lê de lá, não repete números.
- **Deputados:** sem pesquisa pública por candidato. Regressão logística treinada em 2018 e 2022 com dados de
  7 dias antes da eleição (arrecadação escalada pelas vagas, força da lista partido/federação, posição
  na lista, ocupação declarada "deputado", número da urna que repete o do partido, e o que a eleição anterior
  diz: se a pessoa disputou o mesmo cargo e com quantos votos, se foi eleita, e o peso dos partidos da lista),
  ajustada para somar as vagas de cada UF e recalibrada (isotônica; depois disso a soma por UF fica em média a
  2,7% das vagas, no pior caso 7%). A "eleição anterior" liga as pessoas por
  nome civil + data de nascimento (`hist/ant.ts`; o CPF vem mascarado nos arquivos antigos). Validação cruzada
  por UF em 2022: acerta 63% dos eleitos contra 49% de "top-N por dinheiro" (sem as variáveis da eleição
  anterior eram 58%). Deixando uma eleição inteira de fora: 60% em 2018 e 62% em 2022 (sem as variáveis da
  eleição anterior: 57% e 58%). O ganho vem da fatia de votos da própria pessoa e de ela ter sido eleita; o peso
  dos partidos da lista (que segue fusões e números reaproveitados, `hist/succession.ts`) não agrega além do
  dinheiro da lista.
  Para explicar a chance, cada candidatura com 0,5% ou mais leva `ex` (posição na arrecadação do estado,
  vagas esperadas da lista, posição na lista, se declara "deputado", se foi eleita e com quantos votos na
  eleição anterior, peso dos partidos da lista): vem de `explain()` em `model/seats.ts`, que usa o mesmo
  cálculo das features do modelo. Sem `data/hist/<anterior>.json` o build ignora o modelo e avisa.
- **Monte Carlo de votos (`src/radar/mc/`, não usado na interface):** sorteia os votos de cada candidato e lista
  (regressão do log da fatia de votos + choque da lista + choque do partido + resíduo reamostrado) e aplica as
  regras reais de quociente e sobras (`allocate.ts`, que reproduz 99,3% / 99,8% / 99,8% dos eleitos de 2014,
  2018 e 2022 com os votos reais). `bun run radar:mc-backtest` compara tudo deixando uma eleição de fora:
  a logística ganha em acerto, Brier e log-loss nas três eleições, e a média das duas não melhora. Por isso a
  interface continua com a logística; o Monte Carlo fica como ferramenta de análise.
- A interface usa faixas verbais (muito provável ≥85%, provável ≥60%, disputa aberta ≥30%, possível ≥5%,
  improvável) sempre ao lado do número; a definição fica em `web/prev.ts`.
- Não é pesquisa eleitoral e não substitui uma; a interface diz isso junto de cada número.

## Panorama (partidos, dinheiro, alianças, perfil)

Quatro abas que olham o conjunto de candidaturas do cargo aberto na cédula, no estado ou no Brasil todo.
Nenhuma entra na nota. Descritivo, sem ranking de qualidade e sem recomendação.

- **Dados:** `bun run radar:panorama` (`src/radar/panorama.ts`) lê `web/data/uf/*.json` e `agenda.json` e escreve
  `web/data/panorama.json` (~0,3 MB): por escopo (UF e `BR`) e cargo, dinheiro por fonte e por partido, mediana, mulheres,
  vagas esperadas (soma das chances do modelo), concentração em decis e perfil. Sem nomes, ids nem CPF (teste cobre).
- **Privacidade:** percentual de partido só com 3 ou mais candidaturas; perfil só em disputas com 30 ou mais (`MIN_PERFIL`) e,
  categoria com menos de 5 candidaturas (`MIN_CELL`) já sai do JSON reunida em "Outras categorias"; se essa soma ainda ficar
  abaixo de 5, a menor vizinha entra junto, para que o total não revele a célula pequena. "Mulheres" por partido só sai
  quando a célula Feminino também sai. Vale para o **resumo agregado**: gênero, cor/raça e nascimento de cada candidatura
  já estão em `web/data/uf/*.json` (cadastro público do TSE), então isto não é controle de confidencialidade. Limite
  conhecido: a visão Brasil é dobrada por conta própria, e "Brasil menos os outros estados" pode derivar uma categoria que
  só um estado dobrou.
- **Alianças:** vêm do texto de coligação/federação do cadastro (`web/aliancas.ts`), por estado. Deputado só tem federação.
- **Gráficos** (`web/charts.ts`, `web/sankey.ts`): SVG/HTML sem dependências; todo número desenhado também está em texto.
- Sem `panorama.json` as abas mostram como gerá-lo; o resto do Radar não depende dele.
