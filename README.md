# Radar do Voto 2026

Painel técnico para comparar candidaturas das eleições de 4/10/2026 com dados oficiais.
Não recomenda votos: o eleitor escolhe o peso de cada indicador.

## Rodar

```sh
bun install
bun run radar:fetch     # baixa os arquivos da Câmara (idempotente; --force atualiza)
bun run radar:build     # gera web/data/meta.json e web/data/uf/<UF>.json
bun run radar:serve     # http://127.0.0.1:4173  (health: /health)
bun test src/radar web
```

### Passo manual: TSE

O TSE bloqueia downloads automáticos (403 do WAF). Baixe no navegador e salve em `data/`:

- `prestacao_de_contas_eleitorais_candidatos_2026.zip`, em https://dadosabertos.tse.jus.br (conjunto "Prestação de contas eleitorais 2026")

Depois rode `bun run radar:build` de novo. Outro caminho: `TSE_ZIP=caminho.zip bun run radar:build`.

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

## Decisões e limites

- **Cruzamento TSE × Câmara por nome civil.** O TSE mascara CPF nos arquivos de 2026. Homônimos
  são desempatados por UF; se continuar ambíguo, a candidatura fica sem vínculo.
- **Sem CPF nem identidade de doador no JSON público** (há teste de regressão para isso).
- **Presença** usa `/deputados/{id}/historico` para descontar licenças. Líderes que só orientam têm presença medida menor.
- **Cobertura**: só candidaturas com alguma receita declarada. Senado e assembleias estaduais ainda não entram.
- `src/*.ts` (fora de `src/radar`) e `dashboard/` são a versão anterior (ranking de "fraude" de deputados de SP),
  mantidos sem alteração.
