# Apuração em tempo real

Volta para o [README](../README.md). Descoberta dos arquivos do TSE e armadilhas vistas na noite da apuração, no [AGENTS.md](../AGENTS.md) (seção "Apuração em tempo real").

As visões **Corrida** (os mais votados como uma corrida: linhas que trocam de lugar, votos que rolam, ultrapassagens) e **Noite no mapa** (os estados acendem e viram, com cartograma e faixa de duelo) são acréscimos à aba, com fotos, efeitos e som opcionais e uma simulação para ver o movimento antes da apuração (`web/apuracao-corrida.ts`, `apuracao-noite.ts`, `apuracao-fx*.ts`, `apuracao-demo.ts`; AGENTS.md, seção "Visões animadas da Apuração").

Acima das visões ficam a chave **Dados reais / Simulação** e o botão **Tela cheia** (`web/apuracao-sim*.ts`, `apuracao-painel.ts`,
`apuracao-tela-cheia.ts`):

- **Simulação** vale para todas as visões, cargos, estados e os dois turnos (menos Cidades, que usa as candidaturas reais). Cada
  disputa termina no resultado final real do 1º turno no TSE, lido dos arquivos públicos; o 2º turno sai desse arquivo pelo modelo
  da visão Cidades (com um desvio inventado dos eleitores dos demais candidatos, para a chance ter o que medir). Nomes, partidos,
  listas, horários e o caminho da noite (quando cada arquivo começa, para que lado pendem as primeiras seções) são inventados, então
  nenhuma candidatura real aparece com número inventado: sem fotos, dossiês ou médias de pesquisa. Os feeds do TSE param enquanto
  ela está ligada. O player toca, pausa, muda a velocidade (×1, ×3, ×8) e salta para qualquer momento da noite (72 passos de 3 min
  a partir das 17h); um salto refaz o histórico da sessão (gráficos, últimas atualizações, linha do tempo) como se a aba estivesse
  aberta desde o começo. "Dados reais" volta aos arquivos do TSE sem nada da simulação.
- **Tela cheia** (Fullscreen API; Esc ou o botão saem; sem a API, o painel ocupa a janela): a disputa aberta para acompanhar de
  longe. Seções em destaque, duelo (ou os mais votados), chance ao vivo no 2º turno ou resumo da Projeção no 1º, mapa e exterior
  (Presidente), seções e votos e últimas atualizações. Funciona com dados reais e com a simulação.

No 2º turno de Presidente e Governador, a vista **Cidades** estima os votos válidos de cada finalista em cada município a partir
do 1º turno de 2026 e do comportamento dos segundos turnos de 2002 a 2022 (`web/apuracao-municipios*.ts`,
`web/municipio-modelo.ts`, `src/radar/municipal/`). O total da disputa é escolha do leitor (sem âncora, média das pesquisas ou
cenário próprio); o erro medido no passado aparece na própria página. Método, números e o que foi testado e descartado:
AGENTS.md, seção "Estimativa do 2º turno por município".

Abaixo desses controles ficam três botões (`web/apuracao-aviso.ts`, `apuracao-link.ts`, `apuracao-giro.ts`):

- **Avisos**: notificação do navegador (opt-in; pede permissão no clique) quando o TSE marca alguém "Eleito" ou o Radar prova um eleito ou o 2º turno. Só com a aba em segundo plano, nunca na simulação, e nunca por marco de seções. Ligados, a disputa aberta continua sendo consultada com a aba escondida.
- **Copiar link**: `#apuracao?c=<cargo>&uf=<uf>&v=<visão>&t=2&s=<passo>`. Dados reais abrem ao vivo; `s` só existe na simulação e abre pausada naquele momento da noite.
- **Rodar disputas** (só em tela cheia): Presidente, Governador e Senador do estado do eleitor, a cada 20 s.

A consulta de cada arquivo é adaptativa (`apuracao-ritmo.ts#intervaloDe`): 30 s a partir de 90% das seções, 60 s no meio, 2 min com apuração concluída ou arquivo parado há mais de 10 min.

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
- **Visões** (botões Placar / Mapa / Projeção / Chance ao vivo / Exterior / Cadeiras / Câmara / Gráficos dentro da aba):
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
  - *Chance ao vivo* (2º turno de Presidente e Governador; `apuracao-chance.ts`, `apuracao-chance-view.ts`): a chance de cada finalista
    **terminar à frente**, nunca "vencer". Antes do primeiro voto, o modelo dos 2º turnos de 2002 a 2022 (o da visão Cidades) aplicado
    ao 1º turno desta eleição, ancorado na média das pesquisas do par quando ela existe. Com a apuração, o desvio entre o apurado e o
    modelo nas mesmas partes (estados, no Presidente) passa a valer para o que falta, com peso que cresce com os votos apurados
    (metade em 5%). 2.000 sorteios com semente fixa: ruído comum do tamanho do erro medido do modelo (nunca abaixo de ~1,5 p.p.
    enquanto falta voto, porque as urnas não chegam em ordem aleatória) e ruído por estado. Fórmulas e tabela por estado na tela;
    "Estimativa do Radar, não é resultado" no topo; com a apuração concluída a chance some e vale o TSE. A calibração dessa chance
    *durante* uma apuração não foi testada (o teste do modelo é sobre o resultado final).
  - *Exterior* (Presidente, 1º e 2º turno; `apuracao-exterior.ts`): o arquivo `zz` ao vivo (seções, eleitorado, comparecimento,
    os mais votados ao lado da % no país e o peso no total) e o resultado final do 1º turno por cidade do exterior (145 cidades,
    do arquivo de votação por município que o build já usa). Não há mapa-múndi nem arquivo por cidade ao vivo: o TSE publica o
    exterior como um total só. Na simulação a tabela por cidade fica de fora (traz as candidaturas reais).
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
- **Custo de rede:** o mapa, a Câmara e, no Presidente, a Projeção, a Chance, o Exterior e a tela cheia leem 27 arquivos (28 com o exterior) a cada 60 s, no máximo 6 ao mesmo tempo e só com a
  aba visível; fora dessas visões é um arquivo só. Os arquivos têm cache de 20 a 45 s e vão com revalidação por ETag.
- **Pesquisa por estado:** `expectativa.json` traz `lideres` (3 primeiros por média) em cada corrida, gerado no `radar:build`.
  Sem esse campo (build antigo) o modo "Contra a pesquisa" some. Presidente só tem pesquisa nacional: não há modo por estado.
- **Cores:** paleta daltônica fixa, entregue por ordem de nº de estados liderados e mantida na sessão; cor não tem relação com
  espectro político nem com a identidade do partido. A malha dos estados é do IBGE (crédito no rodapé do mapa).
- **Antes da votação** os arquivos já existem, zerados (`s.st = 0`): a tela mostra "Aguardando início".
- **Estado vazio ou falha:** 404 vira "ainda não publicado"; erro de rede mantém os últimos números e avisa a hora deles.
