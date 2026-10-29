# Auditoria estatística dos boletins de urna (2002 a 2026)

Bateria de testes de inconsistência sobre os dados abertos do TSE por seção. **Não é detector de fraude**: cada
sinal vira "para conferir" com o fato e o aviso de que inconsistência estatística não é irregularidade
(mesma regra de neutralidade do `AGENTS.md`). Nenhum dado individual: só seção, município e agregados.

Resultados interativos: painel "Auditoria estatística das urnas" (Artifact). Este diretório guarda como refazer.

## O que foi feito

- 14 turnos de Presidente (2002 a 2026), 5.872.626 seções; 268 disputas de Governador (2002 a 2026).
- Testes: aritmética do boletim; comparecimento ≥ 95%; impressão digital eleitoral (Klimek et al. 2012);
  uniformidade dentro do local de votação (dispersão qui-quadrado, cauda inferior, Benjamini-Hochberg);
  último dígito (Beber e Scacco 2012) contra simulação beta-binomial; segundo dígito de Benford (informativo,
  fraco); percentuais inteiros (Kobak et al. 2016); seções sem brancos nem nulos; boletins idênticos;
  seções atípicas por z robusto dentro do local; sequências monótonas; deslocamento entre turnos;
  eleitorado × população (Censos 2010 e 2022); crescimento do eleitorado; modelo de urna com efeito fixo;
  horário de recebimento; ajuste pelo perfil do eleitorado (idade, escolaridade, gênero).
- **Poder dos testes** (`power.py`): manipulações sintéticas injetadas em 2022 (1º turno) para ver o que cada teste acusa.

## Resultados em uma tela

- Aritmética fecha em todas as seções, exceto **uma** (2002, 2º turno, Bragança-PA, zona 13, seção 69: 536 comparecimentos para 386 aptos; no 1º turno a mesma seção teve 292).
- Nenhum turno mostra subdispersão (o sinal de boletins fabricados com proporção fixa): o número de locais "uniformes demais" fica abaixo do esperado ao acaso nos 14 turnos (1 local em 2026, 1º turno: Erechim-RS).
- Comparecimento ≥ 95%: 0,04% a 0,5% das seções, em queda. Impressão digital sem cauda diagonal.
- Último dígito, percentuais inteiros e boletins idênticos: iguais à simulação honesta.
- Sem brancos nem nulos: excesso em 2002 e 2006 (1º turno), a conferir.
- Seções atípicas (|z| > 5): 0,03% a 0,1% das seções testadas. Muitas são a **última seção do local** (53% em 2022, 1º turno, contra 12% esperado): seções numeradas por ordem de cadastro, com eleitores mais jovens e escolarizados. Ajustar pelo perfil elimina de 16% a 55% dos casos.
- Eleitorado > população 16+: 3.775 de 5.557 municípios em 2022 (mediana 1,06), mesmo padrão em 2010 (correlação 0,70). **Não é sinal de fraude.** A razão é maior em cidades pequenas (94% das cidades com até 5 mil habitantes).
- Modelo de urna (2022): diferença bruta de 3 a 6 pontos entre urnas antigas e UE 2020; com efeito fixo de município 1,1 a 2,1; no mesmo local de votação 0,3 a 0,6 (IC quase sempre inclui zero).
- Poder: enchimento de urna, boletins fabricados, cópias e arredondamento são detectados em frações pequenas; troca de votos espalhada em ≤ 3% das seções (≈ 7,6% da margem de 2022) **não** é detectada.
- Governador: 22 de 268 disputas com algo "para conferir"; 21 são o canto 90/90 (comparecimento e fatia ≥ 90%), concentrado em poucos municípios (e escolas indígenas no AM, 2026, 2º turno).

## Limites e armadilhas de dados

- Bolsa Família × voto **não foi executado**: o servidor da CGU (`dadosabertos-download.cgu.gov.br`) negou acesso a partir do ambiente. Método: agregado mensal por município, quintis como em `elpop2.py`, controle de renda do Censo; sem NIS nem nome.
- `votacao_secao_<ano>_BR.zip` só traz Presidente. Governador e Senador vêm dos zips por UF (`ingest_uf.py`).
- Arquivos de 2022 por UF misturam eleições: **RR contém a "Eleição Suplementar Governador 2026"** (`CD_ELEICAO 6278`) junto da geral (`546`). Filtrar por `CD_ELEICAO` (`patch_rr.py`, `patch_rr_det.py`); sem isso o RR parece ter votos em dobro.
- O candidato com número ≥ 90 existe (PROS = 90): só 95, 96 e 97 são branco, nulo e anulado. `lib.py` usa < 90 para Presidente (não há candidato ≥ 90); `gov.py` usa < 95.
- Horário de recebimento: 2018 em horário de Brasília; 2022 e 2026 em horário local da seção.
- `detalhe_votacao_secao_2002` repete o Presidente em dois arquivos: dedupe por chave de seção.
- Senador não foi analisado (1 ou 2 votos por eleitor conforme o ano; a binomial não vale).

## Como refazer

```sh
export FORENSE_DIR=data/forense   # padrão; raw/, work/, out/ e ds/ ficam aí (gitignored)
# 1. baixar com curl -A "Mozilla/5.0" (o WAF do TSE barra o fetch do Bun)
#    votacao_secao_<ano>_BR.zip -> raw/vs<ano>/vs.zip ; detalhe_votacao_secao_<ano>.zip -> raw/ds<ano>/ds.zip
python3 docs/forense/scripts/ingest.py 2022            # um por ano: gera work/vot_*.pkl e det_*.pkl
python3 docs/forense/scripts/munnames.py
python3 docs/forense/scripts/run_contest.py 2022-1 2022-2   # bateria por turno -> out/c_<ano>_<t>.json
python3 docs/forense/scripts/t_arith.py
python3 docs/forense/scripts/t_cross.py turnos | elpop | urna | tempo
python3 docs/forense/scripts/perfil.py 2022 && python3 docs/forense/scripts/adjust.py 2022
python3 docs/forense/scripts/lastsec.py ; python3 docs/forense/scripts/power.py
python3 docs/forense/scripts/ingest_uf.py 2022 && python3 docs/forense/scripts/gov.py 2022
python3 docs/forense/scripts/build_ds.py ; python3 docs/forense/scripts/build_gov.py   # ds/*.json
python3 docs/forense/scripts/bio.py ingest 2022 1   # idem 2022 2, 2018 1/2, 2026 1/2; depois: bio.py agg (eleitores sem biometria, BU)
python3 docs/forense/scripts/mapa_voto.py            # candidato mais votado por município (seção "Mais votado")
bun run radar:auditoria                                                                 # web/data/auditoria/*.json (aba Auditoria do app, `#auditoria`)
```

Dependências: Python 3.13 com `numpy`, `scipy`, `pandas` e `pyshp`. IBGE/SIDRA: tabelas 1552 (2010) e 9514 (2022);
malha municipal em `geoftp.ibge.gov.br` (`centroids.py`).

Para outra eleição: acrescentar o ano em `lib.ANOS`, rodar `ingest.py <ano>` e as etapas acima.
Conferir a cada eleição o que o arquivo traz (suplementares, candidato com número alto, mudança de colunas).
