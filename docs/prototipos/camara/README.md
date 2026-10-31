# Protótipos com a API de Dados Abertos da Câmara (2026-10-31)

Três páginas autocontidas, com **dados reais** (snapshot em `dados/*.js`, gerado por `coletar.py`). Abrem por `file://`, sem servidor. Nada daqui vai para `web/` nem para a imagem.

```sh
python3 -I docs/prototipos/camara/coletar.py   # refaz os snapshots (~2 min)
```

| Página | Endpoints | O que mostra |
|---|---|---|
| `hemiciclo.html` | `/votacoes/{id}`, `/votos`, `/orientacoes` | Hemiciclo (1 ponto por voto), placar, tabela por partido com orientação da bancada e % que seguiu; lista de quem votou diferente. Ordem alfabética dos partidos: a posição não sugere lado. |
| `pauta.html` | `/eventos`, `/eventos/{id}/pauta` | Próximos dias de Plenário e comissões, itens da pauta por tópico/regime, relator, filtros (tipo, texto, urgência). |
| `tramitacao.html` | `/proposicoes/{id}`, `/tramitacoes`, `/autores`, `/temas` | Linha do tempo, dias parado por órgão (barra), filtro por tipo e órgão. |

## Armadilhas da API (conferidas)

- `/votacoes/{id}/votos` **não aceita `itens`** (400); vem tudo de uma vez.
- `/votacoes`: `dataFim - dataInicio` ≤ 3 meses (400).
- Maioria das votações de Plenário é simbólica (`votos: []`). Nominal: a descrição traz `Sim: N; Não: M`.
- 504 aleatório (`/deputados`, `/partidos`, `/blocos`): repetir com espera.
- Aninhados com sufixo `_` (`deputado_`, `proposicao_`).
- Orientação: `codTipoLideranca` `P` = partido, `B` = bloco/federação/liderança. Nome de bloco vem **truncado** ("Bl UniPpPsd..."), então partido em bloco fica "no bloco". Federação ("Fdr PT-PCdoB-PV") dá para decompor.

## Outras ideias (não prototipadas)

- **Presença em comissões** (`/eventos/{id}/deputados`): % de reuniões deliberativas em que cada membro apareceu. Complementa a presença em Plenário do dossiê.
- **Coesão e distância entre partidos** (`/votos` de todas as nominais do ano): matriz de quanto cada par votou igual. Sem rótulo de esquerda/direita.
- **Dossiê: autoria e relatoria** (`/proposicoes?idDeputadoAutor=`, `/pauta` com `relator`): projetos apresentados por tema, relatorias, tramitação até aprovar (a rota `/autorias` do Senado está morta; a da Câmara funciona).
- **Mandatos e ocupações** (`/deputados/{id}/mandatosExternos`, `/ocupacoes`, `/profissoes`): trajetória anterior, útil para candidato que já foi parlamentar.
- **Mesa e lideranças** (`/legislaturas/{id}/mesa`, `/partidos/{id}/lideres`).
- **Alertas de pauta** no Ao vivo: push quando um projeto acompanhado entra na pauta (precisa servidor, como o monitor do TSE).

Invariantes do Radar mantidos: sem foto, sem CPF (conferido nos snapshots), sem rótulo de lado, sem "vai ser aprovado".
