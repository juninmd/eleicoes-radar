# Radar do Voto: runbook de dados (reaproveitar em outras eleições)

Painel técnico de candidaturas. Não recomenda voto; o usuário escolhe os pesos.
Este arquivo guarda **como baixar, cruzar e validar** cada fonte, para refazer em 2028/2030 sem redescobrir.
Convenções gerais (commits, testes, segurança) vêm do AGENTS.md global do usuário.

## Invariantes (não quebrar)

- **Neutro:** sem fotos na nota (aparência), sem rótulo "fraude"/"fantasma" em pessoa ou empresa. Sinais viram **"Para conferir"** com o fato e o aviso de que não é irregularidade por si.
- **Sem CPF no JSON público**, nem identidade de doador pessoa física. Fornecedores: só pessoa jurídica (CNPJ). Existe teste de regressão; `maskCpf` (build.ts) limpa CPF embutido em nome de fornecedor da CEAP.
- Indicador ausente = 0,5 na nota (evidência parcial não supera histórico completo).
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
bun test src/radar web
bun run radar:serve       # http://127.0.0.1:4173  (/health)
```

Para outra eleição: trocar o ano nos nomes de arquivo (`*_2026*` em `tse-cand.ts`, `candidates.ts`, `enrich/*.ts`, `model/train.ts` usa o ano anterior como treino), `codLegislatura`/`YEARS` em `mandate.ts` e `camara/ceap.ts`, data do pleito em `web/dossier.js` (`ELEICAO`) e `agenda.json` (votações escolhidas por tema; direção conferida com a orientação das bancadas).

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
- Não puxamos quadro societário (QSA) de propósito: escopo e privacidade. Se for cruzar sócios com políticos, decidir isso antes e com revisão de SecOps.
- Alternativa offline se as APIs caírem: dump da Receita (`arquivos.receitafederal.gov.br`, dezenas de GB); não foi necessário.

## Grafo (aba Rede)

- `suppliers/graph.ts` gera `web/data/rede.json` (partidos ↔ top 150 fornecedores por nº de políticos). `web/rede-layout.js` é um layout de forças determinístico, sem dependências.
- Doador pessoa física **não** entra no grafo (decisão de privacidade acima). Entram partidos, candidatos e CNPJs.

## Ambiente e operação

- Windows: Git Bash para POSIX, PowerShell para o resto. **Um servidor `radar:serve` antigo mantém arquivos em memória**: depois de `radar:build`, matar o processo (`Get-CimInstance Win32_Process | ? CommandLine -match serve.ts`) e subir de novo. O navegador também cacheia módulos ES: usar contexto novo ao validar por screenshot.
- Playwright MCP: primeiro uso baixa o navegador via npx (pode dar timeout; ver `claude mcp list`).
- Tamanhos: `web/data/uf` ~47 MB com fornecedores; fotos ~51 MB. Artifact do Claude aceita 64 MB por publish: publicar por UF se passar.
- Deploy: ver README (imagem `ghcr.io/juninmd/eleicoes-radar`, `web/data` fora do git, rollback = re-push da tag anterior como `:latest`).

## Checklist de nova eleição

1. `curl -I` em todas as URLs da tabela do TSE com o novo ano; anotar o que 404.
2. Atualizar anos (ver "Ordem do pipeline"), `agenda.json`, data do pleito.
3. Baixar zips, `unzip -tq`, rodar `fetch` → `polls` → `model` → `profiles` → `suppliers` → `build`.
4. `bun test src/radar web`; conferir `web/data/uf/*.json` sem CPF formatado (`\d{3}\.\d{3}\.\d{3}-\d{2}`).
5. Screenshot de um dossiê de deputado, governador e um com "Situação do registro" (contexto novo do navegador).
