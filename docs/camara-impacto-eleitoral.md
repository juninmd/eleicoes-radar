# Aba Câmara: o que muda para a eleição (2026-10-31)

Resumo para quem revisa o PR. A eleição de 2026 já terminou (1º turno 04/10, 2º turno 25/10); a Câmara atual (57ª legislatura) vai até fevereiro de 2027. A aba descreve o que os deputados **fizeram** no mandato e liga isso ao que o eleitor decidiu.

## 1. O que não muda no Radar

- `score.ts`, o dossiê, `radar:build` e os JSON de `web/data/uf` **não foram tocados**. Votação na Câmara não entra na nota (mesma regra de patrimônio, fornecedores e registro).
- Boot: nenhum arquivo novo é pedido (`carga-sob-demanda.test.ts`). A aba baixa o módulo e `painel.json` (~350 KB) ao abrir, `partidos.json` (~45 KB) junto e `fotos.json` (~1,2 MB) **só com "Mostrar fotos" ligado**.
- CSP igual (`img-src 'self' data:`): fotos e logos entram como `data:` URI gerados na coleta, só de `www.camara.leg.br`.
- Sem CPF em nenhum arquivo (conferido nos JSON e por teste de regressão da view). Só nome, partido, UF e voto de parlamentar, dados públicos da Câmara.

## 2. O que a aba acrescenta (e as decisões de neutralidade)

- **Fotos:** aparecem na dica do hemiciclo, na busca e na ficha do deputado, e na lista de "votou diferente". Não entram em nota nem em ordenação. O invariante "sem fotos na nota" continua valendo; a foto é identificação, não avaliação. Desligam com "Mostrar fotos" (preferência já existente).
- **Logos dos partidos:** só os que a Câmara ainda publica (12 de 22); os demais ficam com selo neutro de 3 letras. Sem cor de partido nos gráficos, ordem alfabética, e o texto diz que a posição no desenho não indica posição política.
- **Afinidade entre partidos** é distância entre votos (não rotula esquerda/direita), com aviso de que vale só para as votações coletadas.
- **Pontos para decisão humana:** (a) logo de partido é marca registrada: a Câmara a publica, mas confirmar se o uso no Radar é aceitável; (b) a ficha "voto a voto" de cada deputado é descritiva, sem nota nem ranking, mas é uma vitrine individual: confirmar com SecOps/produto se fica.

## 3. Cruzamento com o resultado de 2026 (agregado, sem nomes)

Método: ids da Câmara (`/deputados?idLegislatura=57`, 648 pessoas únicas; a API repete linhas) → CPF em `/deputados/{id}` (só em memória) → `consulta_cand_2026_BRASIL.csv` do TSE (CPF real no cadastro) → situação pelo `st` dos arquivos oficiais de `resultados.tse.jus.br` (1º turno e, para governos, o 2º). Conferência: 385 "Eleito por QP" + 128 "por média" = 513 eleitos para a Câmara, e por UF batem com `nv`; o `DS_SIT_TOT_TURNO` do cadastro coincide com o `st` em todos os casos.

**Das 648 pessoas da 57ª legislatura:** 584 foram candidatas em 2026 (508 a deputado federal, 45 a senador, 18 a deputado estadual, 5 a governador, 8 a vice ou suplente) e 64 não concorreram. **311 das 513 cadeiras da próxima Câmara (61%) irão para quem já esteve na atual**; 174 candidatos a federal ficaram como suplentes e 18 não foram eleitos.

**Dos 531 deputados que votaram nas 24 votações nominais coletadas** (303 eleitos a federal, 127 suplentes, 20 não eleitos ou sem situação, 18 eleitos senador, 26 candidatos a senador não eleitos ou em 2º turno, 2 eleitos e 3 não eleitos a governador, 18 em outros cargos, 14 que não concorreram):

| Situação em 2026 | Deputados | Votos com orientação | Divergiram da orientação do partido |
|---|---|---|---|
| Dep. federal eleito | 303 | 2.451 | 6,5% |
| Dep. federal suplente | 127 | 775 | 5,2% |
| Dep. federal não eleito / sem situação | 20 | 68 | 5,9% |
| Senador eleito | 18 | 214 | 6,1% |
| Senador não eleito / 2º turno | 26 | 218 | 6,9% |
| Governador eleito | 2 | 17 | 5,9% |
| Governador não eleito / 2º turno | 3 | 41 | 4,9% |
| Outros cargos | 18 | 94 | 5,3% |
| Não concorreu | 14 | 23 | 4,3% |

Leitura: **não há relação visível entre divergir da orientação do partido e o resultado** (todos os grupos ficam entre 4% e 7%, com amostras pequenas nos grupos menores). Isso é uma foto das 24 votações e **não** é causal; por isso a aba não publica comparação por grupo nem nota por pessoa. O número serve para não prometer o contrário na interface.

## 4. O que fica para depois (não implementado de propósito)

- Ligar a ficha de voto ao dossiê do candidato (o `mandate.ts` já casa Câmara ↔ TSE por CPF do cadastro). Exigiria decidir antes se votação entra no dossiê só como contexto (como `agenda.json`) e revisar a regra "não entra na nota".
- Votações do Senado (outra API, `/autorias` morta) e coleta de todas as nominais da legislatura (hoje as 24 mais recentes; `--max` aumenta).
- Em 2028/2030 o mesmo desenho serve para vereadores só se as câmaras municipais tiverem dados abertos equivalentes (não verificado).
