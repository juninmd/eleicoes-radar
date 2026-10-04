# Radar do Voto: runbook de dados (reaproveitar em outras eleições)

Painel técnico de candidaturas. Não recomenda voto; o usuário escolhe os pesos.
Este arquivo guarda **como baixar, cruzar e validar** cada fonte, para refazer em 2028/2030 sem redescobrir.
Convenções gerais (commits, testes, segurança) vêm do AGENTS.md global do usuário.

## Invariantes (não quebrar)

- **Neutro:** sem fotos na nota (aparência), sem rótulo "fraude"/"fantasma" em pessoa ou empresa. Sinais viram **"Para conferir"** com o fato e o aviso de que não é irregularidade por si.
- **Sem CPF no JSON público**, nem identidade de doador pessoa física. Fornecedores: só pessoa jurídica (CNPJ). Existe teste de regressão; `maskCpf` (`privacy.ts`) limpa CPF embutido em nome de fornecedor (CEAP, TSE e razão social da Receita: MEI vem como "NOME 12345678901", 11 dígitos soltos, além do formato com pontos).
- Indicador ausente = 0,5 na nota (evidência parcial não supera histórico completo). Se **nenhum** indicador escolhido tem dado, a nota é `null` ("–"): um 50 inventado pareceria avaliação (`score.js`).
- Patrimônio, fornecedores, registro, comissões etc. **não entram na nota**; são contexto no dossiê.
- Links de redes sociais: só https de hosts conhecidos (`safeLinks` em `profiles/extra.ts`).

## Ordem do pipeline (bun)

```sh
bun run radar:fetch       # Câmara (CSV/JSON abertos), idempotente
# TSE: ver "Download do TSE" abaixo (manual/curl)
bun run radar:polls       # pesquisas (Wikipédia)
bun run radar:model       # modelo de deputados treinado na eleição anterior
bun run radar:profiles    # Câmara/Senado/Wikidata/Wikipédia por candidato (cache em data/extra, data/wikidata)
bun run radar:suppliers   # CNPJ dos fornecedores na Receita (cache data/receita/cnpj.jsonl, retomável)
bun run radar:build       # gera web/data/ (4 a 9 min)
bun run radar:panorama    # web/data/panorama.json (agregados por partido/cargo; sempre depois do build)
bun test src/radar web
bun run radar:serve       # http://127.0.0.1:4173  (/health)
```

Para outra eleição: trocar o ano nos nomes de arquivo (`*_2026*` em `tse-cand.ts`, `candidates.ts`, `enrich/*.ts`, `model/train.ts` usa o ano anterior como treino), `codLegislatura`/`YEARS` em `mandate.ts` e `camara/ceap.ts`, vagas de Senador na cola (`seats` em `BALLOTS`, `web/app.js`: 2 em 2026/2034, 1 em 2030), data do pleito em `web/dossier.js` (`ELEICAO`) e `agenda.json` (votações escolhidas por tema; direção conferida com a orientação das bancadas).

## Download do TSE

Base: `https://cdn.tse.jus.br/estatistica/sead/odsele/<pasta>/<arquivo>.zip`. Os zips têm um CSV por UF **e** um `*_BRASIL.csv` (união; ler só o BRASIL, senão duplica). Encoding latin1, separador `;`.

| Dado | pasta/arquivo | Usado em |
|---|---|---|
| Cadastro | `consulta_cand/consulta_cand_<ano>.zip` | `tse-cand.ts` (nome, urna, nascimento, ocupação, instrução, estado civil, coligação, CPF só como chave) |
| Contas (receitas/despesas) | `prestacao_contas/prestacao_de_contas_eleitorais_candidatos_<ano>.zip` | `tse.ts`, `suppliers/collect.ts` |
| Vagas | `consulta_vagas/consulta_vagas_<ano>.zip` | expectativa (Senado, deputados) |
| Bens | `bem_candidato/bem_candidato_<ano>.zip` | `enrich/bens.ts` |
| Fundamentos de indeferimento | `motivo_cassacao/motivo_cassacao_<ano>.zip` | `enrich/cassacao.ts` |
| Coligações | `consulta_coligacao/consulta_coligacao_<ano>.zip` | (baixado; coligação por candidato vem do cadastro) |
| Fotos | `foto_cand/foto_cand<ano>_<UF>_div.zip` (+ `BR`) | `profiles/tse-photos.ts` |

- Salvar em `data/tse/`. O WAF do TSE devolveu 403 ao `fetch` do Bun, mas **`curl -s -A "Mozilla/5.0" -o arq.zip <url>`** funcionou (2026-09-29). Se falhar, baixar no navegador (`Start-Process <url>`).
- `rede_social_candidato`, `proposta_governo`, `consulta_cand_complementar` deram **404** em 2026. A API `divulgacandcontas.tse.jus.br` dá 403. Reavaliar a cada eleição (`curl -I`).
- Verificar cada zip com `unzip -tq` e `unzip -l` antes de usar.

## Chaves de cruzamento e armadilhas

- **CPF mascarado:** contas 2026 trazem `NR_CPF_CANDIDATO = "-4"`; o cadastro tem CPF real. Cruzar Câmara ↔ TSE por CPF do cadastro ↔ `cpf` da CEAP (538 deputados vs 339 só por nome); reserva: nome civil normalizado + UF.
- **Entre eleições (patrimônio):** o cadastro de 2022 tem CPF mascarado na maioria. Chave de pessoa = CPF se visível, senão `nome civil + data de nascimento` (`enrich/bens.ts#personKey`). 4.194 de 13.913 vincularam. O arquivo de cadastro também traz eleições suplementares do ano seguinte: filtrar `ANO_ELEICAO`.
- `SQ_CANDIDATO` é a chave em todos os arquivos do TSE do mesmo ano. **Muda a cada eleição.**
- `DS_SITUACAO_CANDIDATURA` vem `#NE` para todos (não usar); situação vem de `motivo_cassacao` (fundamento, **não é decisão final**, pode haver recurso).
- Despesas de campanha: `NR_CPF_CNPJ_FORNECEDOR` (CNPJ de 14 dígitos = PJ). Excluir "Encargos financeiros" (todo mundo paga banco) e linhas com `SQ_CANDIDATO_FORNECEDOR` preenchido (repasse entre campanhas). Município/UF do fornecedor no TSE quase sempre nulo: endereço vem da Receita.
- Valores no formato BR (`"1.234,50"`): usar `parseNumber` de `csv.ts`. CSV do TSE tem quebras de linha dentro de campos: só o parser de `csv.ts`.
- Zips grandes (contas 2022 = 367 MB): stream com `zip-csv.ts#forEachZipRow`, não `unzipSync`.
- Prestação parcial: o "retrato" do TSE é de `dataRetrato`; mostrar a data na interface.

## Câmara / Senado (sem chave)

- Câmara: arquivos abertos anuais (proposições, votações, votos, orientações, CEAP `Ano-<y>.csv.zip`) + `dadosabertos.camara.leg.br/api/v2`. Por deputado: `/deputados/{id}` (redes, escolaridade), `/orgaos?dataInicio=` (comissões), `/frentes`, `/discursos?itens=1` (total no header `x-total-count`), `/historico` (exercício e licenças).
- **Presença:** usar intervalos de exercício de `/historico`; janela primeiro..último voto pune licenciado. Líderes orientam e votam menos (limitação documentada).
- Senado: `legis.senado.leg.br/dadosabertos/senador/lista/atual.json`, `/senador/{cod}`, `/mandatos`, `/comissoes`. `/autorias` está **descontinuado** (2026-02) e `/profissao` retorna 503. Sempre `Accept: application/json`.
- Reeleição/estreia só verificável para mandatos federais; governador, presidente e deputado estadual ficam "não verificado".
- CEAP: `txtCNPJCPF` formatado ("085.324.290/0013-1"); só 14 dígitos vira fornecedor. `txtFornecedor` de pessoa física pode embutir CPF (mascarar).

## Wikidata / Wikipédia

- Só para Presidente, Governador, Senador (`WIKI_RACES`). `findPerson` exige nome que concorde e humano brasileiro; homônimo ambíguo = sem vínculo.
- Resumo: via sitelink `ptwiki` do QID já validado + REST `page/summary`; conferir `wikibase_item === qid`.
- Rajada gera **429**: `profiles/extra.ts` faz backoff; rodar de novo completa o cache (`data/extra/`). O passo inteiro leva ~10 a 40 min.

## Fornecedores e CNPJ (Receita)

- Fonte sem chave: `brasilapi.com.br/api/cnpj/v1/{cnpj}` e `minhareceita.org/{cnpj}` (mesmo esquema). Um espelho sozinho fica em ~2 req/s; **alternando os dois por worker chegou a ~27 req/s** (24 mil CNPJs em ~15 min). 404/400 = CNPJ não encontrado (cacheado); 429/5xx = tenta o outro espelho, não cacheia falha.
- Priorização: CNPJs no top 5 de fornecedores de cada candidatura, titulares primeiro. Cache JSONL `data/receita/cnpj.jsonl`, linha truncada é ignorada e refeita.
- Sinais "para conferir" (`suppliers/flags.ts`): dígito verificador inválido, CNPJ não localizado, situação ≠ ATIVA, aberta ≤180 dias antes do 1º pagamento (ou depois dele), capital social < 1/50 do recebido (total ≥ R$100 mil), endereço compartilhado por ≥4 fornecedores. Cerca de 20% dos fornecedores acendem algum: por isso o texto insiste que não é irregularidade.
- Data de criação = `data_inicio_atividade` (campo `abertura` no cache; presente em 100% dos 24.111 CNPJs achados). "Empresa nova" = aberta <365 dias antes do 1º pagamento (`flags.ts#ageAtFirstPayment`); a aba Rede lista as 25 novas que mais receberam (mín. R$ 50 mil, CNPJ válido). ~2.050 dos consultados abriram nos últimos 12 meses.
- Não puxamos quadro societário (QSA) de propósito: escopo e privacidade. Se for cruzar sócios com políticos, decidir isso antes e com revisão de SecOps.
- Alternativa offline se as APIs caírem: dump da Receita (`arquivos.receitafederal.gov.br`, dezenas de GB); não foi necessário.

## Grafo (aba Rede)

- `suppliers/graph.ts` gera `web/data/rede.json` (partidos ↔ top 150 fornecedores por nº de políticos). `web/rede-layout.js` é um layout de forças determinístico, sem dependências.
- Doador pessoa física **não** entra no grafo (decisão de privacidade acima). Entram partidos, candidatos e CNPJs.

## Panorama (abas Partidos, Dinheiro, Alianças, Perfil)

- `src/radar/panorama.ts` roda **depois** do `radar:build` (lê `web/data/uf/*.json`); escopo `BR` = soma de todas as UFs + `BR.json`. Sai só agregado: sem nome, id ou CPF.
- Rótulos de perfil (gênero, cor, escolaridade, faixa de idade) ficam em `panorama.ts` e em `web/pan-perfil.js#FACETS`; um teste cruza os dois. Mudou um, mude o outro.
- Mínimos de privacidade: partido com <3 candidaturas sem percentual (`MIN_N` em `pan-partidos.js`); perfil só em disputa com ≥30 (`MIN_PERFIL`); categoria <5 é reunida em "Outras categorias" **no JSON** (`foldMap` em `panorama.ts`; se a soma ainda ficar <5 a vizinha menor entra junto, senão o total entrega a célula; `mulheres` por partido só sai se a célula Feminino sai, `womenShown`). Vale só para o **resumo agregado**: gênero, cor e nascimento por candidatura já são públicos em `web/data/uf` (cadastro do TSE), e a visão Brasil é dobrada à parte (Brasil menos os outros estados pode derivar uma categoria dobrada em um só estado). A tela também esconde categoria pequena de export antigo (`MIN_CELL` e `OUTRAS` em `pan-perfil.js`, cruzados por teste).
- Coligação do TSE: `NOME: A / B / FEDERAÇÃO X (44-A / 11-B)`. Nome pode conter `: `; separar por `/` só fora de parênteses (`aliancas.js#parseColigacao`). Deputado: só federação.
- Alianças usam as candidaturas já carregadas do estado; não há `panorama.json` para elas.

## Ambiente e operação

- Windows: Git Bash para POSIX, PowerShell para o resto. **Um servidor `radar:serve` antigo mantém arquivos em memória**: depois de `radar:build`, matar o processo (`Get-CimInstance Win32_Process | ? CommandLine -match serve.ts`) e subir de novo. O navegador também cacheia módulos ES: usar contexto novo ao validar por screenshot.
- Layout shift: `styles.css` reserva a altura final do que o JS preenche depois (`#cedulas`, `#achados`, `#presets`, `#pesos`); `.metodo` só aparece com `body.ready`. Mudou a lista de indicadores ou o CSS dessas caixas? Meça o CLS de novo (PerformanceObserver `layout-shift`; meta: <0,1) e ajuste os `min-height`.
- `serve.ts` manda CSP (`default-src 'none'`; `connect-src` só a origem e `resultados.tse.jus.br`; sem inline script) e demais cabeçalhos em toda resposta; teste cobre. Nova origem externa no cliente = ajustar a CSP junto. HSTS fica no proxy TLS.
- Fontes são locais (`web/fonts`, subset latin, OFL com os textos de licença ao lado); `fonts.css` as declara. Trocar fonte: baixar o woff2 latin, atualizar `fonts.css` e os `preload` do `index.html`.
- Playwright MCP: primeiro uso baixa o navegador via npx (pode dar timeout; ver `claude mcp list`).
- Tamanhos: `web/data/uf` ~52 MB com fornecedores e explicação dos deputados (`prev.ex`); fotos ~51 MB. Artifact do Claude aceita 64 MB por publish: publicar por UF se passar.
- Deploy: ver README (imagem `ghcr.io/juninmd/eleicoes-radar`, `web/data` fora do git, rollback = re-push da tag anterior como `:latest`).

## Apuração em tempo real (resultados do TSE)

Aba Apuração (`web/apuracao*.js`): o navegador lê os arquivos de `resultados.tse.jus.br`, sem build e sem servidor. Descoberta e armadilhas, para refazer em 2028/2030:

- **Códigos:** `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json` → `pl[]` do ciclo (`ele2026`) → `e[]` (`cd` 1º turno, `cdt2` 2º turno) e `abr[].cp[].cd` (cargos). Em 2026: 1º turno `6257` (Presidente) e `6259` (demais); 2º turno `6258` e `6260`. Trocar `TSE_BASE` e `eleicao()` em `web/apuracao-tse.js`.
- **Nome do arquivo:** não chutar. Baixar os chunks do site (`/oficial/app/runtime.*.js` lista os hashes) e procurar `-u.json`. O padrão `dados-simplificados/.../-r.json` que parecia certo **dá 404**. O certo é `dados/<uf>/<uf>-c<cargo 4 dígitos>-e<eleição 6 dígitos>-u.json`; municipal leva o código do município colado na UF (`sp71072-c0011-e000619-u.json`).
- **Arquivo populado para testar:** os de 2024 seguem no ar (prefeito de SP, 1º e 2º turno: `ele2024/619` e `ele2024/620`). Serviram para validar que `pvap` = votos / `vvc` (votos nos candidatos) e que a soma dos `pvap` fecha em 100. Os de 2026 vêm zerados até a votação. Os de 2022 deram 404 nas URLs que tentei (o padrão de 2022 pode ser outro; não investiguei). Os ambientes `teste/` e `simulado/` dão 503.
- **Campos** (conferidos no código do site e nesses arquivos): `s.ts/st/snt` seções, `e.te/est/c/a` eleitorado (use `est`, o das seções totalizadas, como base do comparecimento), `v.tv/vvc/vv/vb/tvn` votos, candidato `vap/pvap/e/st`, cargo `nv` vagas, `qe` quociente, `agr[].vag` vagas por lista. Todo número vem como string, percentual com vírgula.
- **`e: "s"` não é "eleito".** O texto está em `st` ("Eleito", "2º turno", "Eleito por QP", "Não eleito"). Mostrar só o `st`.
- **`curl -H "Accept-Encoding: gzip" -o` grava o gzip cru**; sem o header o TSE devolve texto.
- **CORS:** o TSE reflete a origem (`Access-Control-Allow-Origin`), por isso não há proxy. Reavaliar a cada eleição com `curl -H "Origin: http://localhost:4173" -D -`.
- **Timers:** `createFeed` não pode usar `{ set: setTimeout }` como padrão: o navegador lança "Illegal invocation" quando `setTimeout` é chamado como método. Há teste de regressão.
- **Atualização sem apagar a tela:** `mountApuracao` só troca o relógio (`#apu-quando`) quando nada mudou (`semRelogio`); ao redesenhar, devolve `details` aberto, foco e rolagem da tabela. Erro no renderer é logado e não derruba o polling; 404 depois de números bons mantém os números.
- **Seções %:** arredondada para baixo enquanto parcial (9.996/10.000 = 99,9%), para nunca mostrar "100,0%" com a apuração aberta.
- **Visões nacionais (mapa, Câmara):** `web/apuracao-uf.js` lê os 27 arquivos de estado (e `zz`, o exterior, só no Presidente) com `loadResultado`, no máximo 6 por vez, um timer por ciclo, mesmo contrato do `createFeed` (token contra resposta velha, estado que falha mantém os números, 404 = "ausente", erro do renderer só é logado). Só roda com o Mapa ou a Câmara abertos (`apuracao-mount.js`). A soma nacional do Presidente (`totalNacional`) é soma dos arquivos de estado: o total oficial é o arquivo `br` do Placar.
- **Malha dos estados:** `bun run radar:geo` baixa `servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`, projeta (equiretangular com cos 14°S) e grava `web/mapa-uf.json` (versionado, ~58 KB). Chave IBGE → sigla em `uf-map.ts#UF_BY_IBGE`; código desconhecido derruba o script. Rótulo só em estado com área ≥ 650 (`MIN_ROTULO`); os menores viram botão. Municípios ficaram de fora de propósito: seriam 645+ arquivos por estado a cada minuto em cada navegador.
- **Pesquisa por UF no mapa:** `expectativa.ts#lideres` guarda 3 líderes por corrida (id, nome de urna, partido, média, faixa); o mapa compara o líder da apuração com o das pesquisas; com 2 vagas (Senado) compara os 2 primeiros nomes em qualquer ordem, e o texto diz "mesmos nomes", nunca "líder" (`contraPesquisa` devolve `n`; `rotulosComp` dá as palavras). Se as pesquisas citam menos nomes que vagas, compara só quantos elas citam. Presidente só tem pesquisa nacional. Mudou o formato de `corridas`, rode `radar:build` e `radar:panorama`.
- **Números velhos:** o feed guarda o último arquivo quando um estado passa a falhar; `linhasUf` marca `defasada` (erro ou "ausente" com números) e mapa, painel, tabela e soma dizem "desatualizado" em texto. Estado desatualizado não conta como "em andamento".
- **Cores e foco no mapa:** `PALETA` tem 11 cores; além delas o partido (ou a lista da Câmara) divide o cinza `RESTO` e a legenda avisa, em vez de repetir cor. A Câmara tem memória de cor própria. O contorno do estado selecionado é um `<path class="uf-anel">` por cima: mover o próprio estado mudaria a ordem do Tab. A região `aria-live` mora fora da área redesenhada (`mountApuracao` cria a irmã de `#apu-view`), senão o leitor de tela nunca anuncia. O foco volta ao mesmo controle pela posição entre os que casam igual (estado pequeno é chip e botão da tabela).
- **Primeiro arquivo populado de 2026:** conferir que Σ `pvap` ≈ 100 nos majoritários, que `v.tv` bate com o comparecimento e o texto de `st` dos eleitos; só depois confiar na tela (até aqui isso foi validado só com os arquivos de 2024 e com dados simulados). Presidente: conferir que `sqcand` é o mesmo em todos os arquivos de estado e no `zz`, porque `totalNacional` soma por esse id (só vi arquivos municipais). Para Deputado Federal conferir também que `agr[].vag` aparece e que Σ vagas atribuídas fecha em 513 ao fim; a soma de `nv` dos 27 arquivos já fecha em 513 (conferido antes da votação).

## Checklist de nova eleição

1. `curl -I` em todas as URLs da tabela do TSE com o novo ano; anotar o que 404.
2. Atualizar anos (ver "Ordem do pipeline"), `agenda.json`, data do pleito.
3. Baixar zips, `unzip -tq`, rodar `fetch` → `polls` → `model` → `profiles` → `suppliers` → `build`.
4. `bun test src/radar web`; conferir `web/data/*.json` e `web/data/uf/*.json` sem CPF formatado (`\d{3}\.\d{3}\.\d{3}-\d{2}`) **nem 11 dígitos soltos dentro de texto** (`(?<!\d)\d{11}(?!\d)` em string maior que 11; o `id` de candidatura/SQ também tem 11 dígitos e é esperado).
5. Screenshot de um dossiê de deputado, governador e um com "Situação do registro" (contexto novo do navegador).
