# Radar do Voto 2026

Painel técnico para comparar candidaturas das eleições de 4/10/2026 com dados oficiais.
Não recomenda votos: o eleitor escolhe o peso de cada indicador.

## Rodar

```sh
bun install
bun run radar:fetch     # baixa os arquivos da Câmara (idempotente; --force atualiza)
bun run radar:polls     # pesquisas da Wikipédia -> data/pesquisas.json (cache diário; --force atualiza)
bun run radar:hist 2014 # (uma vez; também 2018 e 2022, ~3 min cada) resultados e contas das eleições passadas -> data/hist/
bun run radar:model     # treina o modelo de deputados em 2018 e 2022 -> data/modelo-deputados.json
bun run radar:profiles  # trajetória e fotos de reserva (Câmara, Senado, Wikidata)
bun run radar:suppliers # CNPJ dos fornecedores na Receita (BrasilAPI + minhareceita, sem chave; retomável)
bun run radar:build     # gera web/data/ (uf/<UF>.json, fotos/, expectativa.json, meta.json)
bun run radar:panorama  # agregados das abas Partidos/Dinheiro/Perfil -> web/data/panorama.json (depois do build)
bun run radar:geo       # uma vez: malha dos estados (IBGE) -> web/mapa-uf.json (versionado; o mapa da Apuração usa)
bun run radar:serve     # http://127.0.0.1:4173  (health: /health)
bun test src/radar web
bun run typecheck       # tsc estrito sobre src/radar e web (o web é TypeScript)
```

### Passo manual: TSE

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

## Apuração em tempo real

Aba **Apuração**: o navegador lê direto os arquivos de resultados do TSE (`web/apuracao-tse.ts`,
`apuracao-feed.ts`, `apuracao.ts`), sem passar pelo servidor do Radar, e consulta de novo a cada 60 s
enquanto a aba está aberta e visível.

- **URL:** `https://resultados.tse.jus.br/oficial/ele2026/<eleição>/dados/<uf>/<uf>-c<cargo>-e<eleição>-u.json`.
  1º turno: eleição `6257` (Presidente, arquivo `br`) e `6259` (Governador `3`, Senador `5`, Deputado Federal `6`,
  Estadual `7`, Distrital `8`, um arquivo por UF). Os códigos saem de `config/ele-c.json`; o 2º turno usa `6258` e `6260`.
- **Sem proxy:** o TSE responde CORS para qualquer origem e `Cache-Control` de 20 a 45 s (`max-age`), então não há fetch no
  servidor nem URL montada a partir de entrada do usuário (`tseUrl` só aceita cargo conhecido e UF de 2 letras).
  Se o TSE parar de liberar CORS, ficar fora do ar (ou o arquivo sumir, 404), a aba mostra o motivo e mantém os
  últimos números e a hora deles. Cada consulta tem limite de 20 s; um erro ao desenhar não interrompe a consulta seguinte.
- **Só mostra o que o TSE publica:** a coluna Situação é o texto `st` do arquivo. `e: "s"` não quer dizer "eleito"
  (no 1º turno de 2024 os dois mais votados vinham `e=s` com `st="2º turno"`), e o Radar não projeta vencedor.
- **"Matematicamente eleito"** (`apuracao-eleito.ts`): a única etiqueta do Radar, e é prova, não projeção. Falta no pior caso
  `apto - apurado` (eleitores das seções ainda não totalizadas, abstenção inclusa, todos votando no rival). Presidente e
  Governador: mais da metade dos votos válidos que ainda podem existir (`base + falta`, com `base` = o maior entre `vv` e a soma dos candidatos). Senado: o último eleito segue
  à frente do primeiro de fora mesmo que ele leve todos os votos que faltam. Proporcionais nunca; arquivo de estado do
  Presidente nunca (é uma fatia). O texto do TSE ("Eleito") sempre vale mais: se ele existe, a etiqueta do Radar não aparece,
  e se o TSE diz outra coisa sobre quem a conta escolheu, o Radar não afirma nada.
- **"Segundo turno garantido"** (`apuracao-eleito.ts#segundoTurno`, Presidente nacional e Governador): a mesma prova do pior caso
  para o 1º turno. O mais votado não passa de 50% dos votos válidos nem se todos os eleitores das seções que faltam votassem
  nele (`votos + falta ≤ (base + falta) / 2`, com `base` = o **menor** entre `vv` e a soma dos candidatos: aqui a base menor é a
  segura). A dupla só é dada como fechada se o terceiro não alcança o segundo nem com todos os votos que faltam
  (`votos 2º − votos 3º > falta`); senão a tela diz que o 2º turno é certo mas o segundo lugar está aberto. Se o TSE marcou
  "Eleito" em alguém, ou "2º turno" em quem a conta não escolheu (ou enquanto a dupla ainda está em aberto: o TSE já sabe
  mais que a conta), o Radar não afirma nada. É sempre "conta do Radar, não é a
  marcação do TSE", e a tela cita o arquivo do TSE em que a conta vale (não diz "às 20h55").
- **Comparação com pesquisas** (`apuracao-pesquisa.ts`): Presidente, Governador e Senador. Mesma base (votos válidos),
  seta sem cor (acima ou abaixo da pesquisa não é bom nem ruim) e "dentro/fora da faixa de 90%". Com a apuração parcial a
  tela diz que a diferença pode refletir quais urnas já entraram, além do erro da pesquisa ("dentro/fora da faixa por
  enquanto"). No Senado cada eleitor vota em até 2 nomes: a nota avisa que as % são de votos, não de eleitores.
  Deputados não têm pesquisa.
- **Visões** (botões Placar / Mapa / Projeção / Cadeiras / Câmara / Gráficos dentro da aba):
  - *Placar*: a tabela de candidatos da disputa aberta, com a comparação com as pesquisas. Mostra a idade do arquivo do TSE
    ("há 2 min") e, com a apuração aberta e mais de 10 min sem arquivo novo, um aviso de que a pausa é do TSE (`apuracao-ritmo.ts`).
    Em Presidente e Governador traz o **duelo** (`apuracao-duelo.ts`): os dois mais votados numa barra com a linha dos 50% dos
    votos válidos, quanto falta a cada um para 50%, a diferença em pontos e em votos e os eleitores das seções que faltam
    (a barra tem o texto equivalente ao lado). E **Últimas atualizações** (`apuracao-novidades.ts`): uma linha por marco da
    apuração (a cada 5 pontos de seções, depois a cada ponto a partir de 90%) e por mudança (o TSE marcou um `st`, uma prova do
    Radar passou a valer), na hora do arquivo do TSE; só em memória, some ao fechar a aba.
  - *Projeção* (Presidente e Governador): para onde a apuração caminha, **em percentual de votos válidos, nunca em vencedor**
    (`apuracao-projecao.ts`, `apuracao-projecao-view.ts`). Mostra hoje × projeção com faixa de 5% a 95%, quanto dos votos que
    faltam cada um precisaria para passar de 50%, a chance de decidir no 1º turno e de ir ao 2º, o gráfico "O que falta apurar"
    por estado e a conta aberta do 2º turno (quanto dos votos dos demais o segundo colocado precisaria; sem probabilidade de
    vencer, de propósito). As fórmulas estão na tela ("Como calculamos") e a tela diz que é estimativa do Radar, não resultado.
    O Presidente soma os 28 arquivos (precisa de todos terem respondido uma vez e avisa quando usa menos).
  - *Cadeiras* (Deputado Federal, Estadual e Distrital): quem ocupa cada vaga de cada lista com os votos de agora, os dois primeiros
    de fora e as listas em que a última vaga está apertada (`apuracao-cadeiras.ts`). Leitura da contagem, não resultado: vale o "Eleito" do TSE.
  - *Mapa* (Presidente, Governador, Senador): 27 estados em SVG (`apuracao-mapa.ts`; Presidente soma também o arquivo do
    exterior, `zz`). Modos: quem lidera (cor = partido do líder, tom = % do líder), margem (no Senado, na última vaga),
    andamento da apuração e, para Governador e Senador, contra a pesquisa (líder igual ou diferente; diferente aparece
    hachurado, nunca em cor de "erro"). Estados pequenos (DF, SE, AL) e o exterior têm botão próprio. Tabela dos estados
    abaixo = versão em texto; clicar num estado abre os candidatos dele e "Abrir a disputa" muda a UF da cédula.
  - *Câmara* (Deputado Federal): hemiciclo com as vagas que o TSE já atribuiu a cada partido ou federação (`agr[].vag`), somadas
    nos 27 estados; vagas ainda sem lista ficam em cinza. Não há comparação com pesquisa (deputado não tem).
  - *Gráficos*: eleitorado das seções apuradas (válidos, brancos, nulos, abstenção), apuração × faixa de 90% das pesquisas
    por candidato e evolução das parcelas desde que a aba foi aberta (só em memória, um ponto por versão de arquivo do TSE).
- **Custo de rede:** o mapa, a Câmara e a Projeção do Presidente leem 27 arquivos (28 com o exterior) a cada 60 s, no máximo 6 ao mesmo tempo e só com a
  aba visível; fora dessas visões é um arquivo só. Os arquivos têm cache de 20 a 45 s e vão com revalidação por ETag.
- **Pesquisa por estado:** `expectativa.json` traz `lideres` (3 primeiros por média) em cada corrida, gerado no `radar:build`.
  Sem esse campo (build antigo) o modo "Contra a pesquisa" some. Presidente só tem pesquisa nacional: não há modo por estado.
- **Cores:** paleta daltônica fixa, entregue por ordem de nº de estados liderados e mantida na sessão; cor não tem relação com
  espectro político nem com a identidade do partido. A malha dos estados é do IBGE (crédito no rodapé do mapa).
- **Antes da votação** os arquivos já existem, zerados (`s.st = 0`): a tela mostra "Aguardando início".
- **Estado vazio ou falha:** 404 vira "ainda não publicado"; erro de rede mantém os últimos números e avisa a hora deles.

## Deploy

Imagem `ghcr.io/juninmd/eleicoes-radar` (`Dockerfile`: só `web/` + `serve.ts`), servida em
`https://eleicoes-radar.antonio-code.duckdns.org` via `juninmd/app-charts/eleicoes-radar` (ArgoCD).
`web/data` vem dos arquivos do TSE, que não estão no git, então a imagem é construída na máquina
que rodou o pipeline:

```sh
bun run radar:build && bun run radar:panorama && bun test src/radar web
docker build --platform linux/amd64 -t ghcr.io/juninmd/eleicoes-radar:$(git rev-parse --short HEAD) -t ghcr.io/juninmd/eleicoes-radar:latest .
docker push ghcr.io/juninmd/eleicoes-radar:latest   # o Deployment usa :latest + imagePullPolicy Always
kubectl -n apps rollout restart deploy/eleicoes-radar
```

Rollback: `docker push` da tag anterior como `:latest` e `rollout restart`. Saúde: `GET /health`.

O servidor (`src/radar/serve.ts`) envia `Content-Security-Policy` restritiva (`default-src 'none'`, scripts só da própria origem,
`connect-src` só a origem e `resultados.tse.jus.br`), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` e afins em toda
resposta. As fontes (Big Shoulders Display, Public Sans, Spline Sans Mono; licença OFL em `web/fonts/`) são servidas daqui, sem
Google Fonts.

## Interface

- **Teclado e leitor de tela:** abas de visão e de cédula seguem o padrão WAI-ARIA (uma parada de Tab, setas/Home/End; painéis
  ligados por `aria-controls`); Enter/Espaço no grafo da Rede; o dossiê recebe o foco ao abrir e devolve ao fechar (Esc).
- **Nota sem dado:** se nenhum indicador escolhido tem dado para a candidatura (ex.: governador com pesos de mandato), a nota
  aparece como "–", e a lista oferece os pesos de Campanha em um clique. A busca ignora acentos.
- **Celular:** o estado (UF) vem antes da lista; pesos e cola ficam depois, com atalho "Ajustar o que pesa".
- **Desempenho:** CLS medido em 0,008 (desktop) e 0,020 (celular emulado, 390 px) com a altura do que é preenchido por JS reservada em CSS.

## Decisões e limites

- **Cruzamento TSE × Câmara por CPF** (cadastro do TSE × cota parlamentar), com nome civil + UF como
  reserva. O CPF só é usado como chave e nunca vai para o JSON público.
- **Sem CPF nem identidade de doador no JSON público** (há teste de regressão para isso).
- **Presença** usa `/deputados/{id}/historico` para descontar licenças. Líderes que só orientam têm presença medida menor.
- **Cobertura**: todas as candidaturas do cadastro do TSE. Mandatos no Senado e nas assembleias estaduais
  ainda não entram nos indicadores.
- `src/*.ts` (fora de `src/radar`) e `dashboard/` são a versão anterior (ranking de "fraude" de deputados de SP),
  mantidos sem alteração.
