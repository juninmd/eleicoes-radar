# Deploy

Volta para o [README](../README.md).

Imagem `ghcr.io/juninmd/eleicoes-radar` (`Dockerfile`: só `web/` + `serve.ts`), servida em
`https://eleicoes-radar.antonio-code.duckdns.org` por um Deployment no namespace `apps` de um k3s.
O manifesto não está versionado em `juninmd/app-charts` (404 em 2026-10-24): o `kubectl` abaixo
reinicia o Deployment que já existe.
`web/data` vem dos arquivos do TSE, que não estão no git, então a imagem é construída na máquina
que rodou o pipeline:

```sh
bun run radar:build && bun run radar:panorama && bun test src/radar web
docker build --platform linux/amd64 -t ghcr.io/juninmd/eleicoes-radar:$(git rev-parse --short HEAD) -t ghcr.io/juninmd/eleicoes-radar:latest .
docker push ghcr.io/juninmd/eleicoes-radar:latest   # o Deployment usa :latest + imagePullPolicy Always
kubectl -n apps rollout restart deploy/eleicoes-radar
```

Rollback: `docker push` da tag anterior como `:latest` e `rollout restart`. Saúde: `GET /health`.

> [!WARNING]
> `.github/workflows/docker.yml` também constrói e publica a imagem a cada push em `main`, só com o que
> está no git, ou seja, sem `web/data`, e marca essa imagem como `:latest` (`juninmd/base-actions`,
> `docker-build-push`). Como o Deployment usa `:latest` com `imagePullPolicy: Always`, o próximo reinício
> depois de um merge serve o site sem dados. Depois de cada merge em `main`, publique de novo a imagem
> construída aqui como `:latest`. No rollback, use uma tag construída aqui (sha curto, do `git rev-parse --short`):
> as tags de sha longo vêm do CI e também não têm `web/data`.

O servidor (`src/radar/serve.ts`) envia `Content-Security-Policy` restritiva (`default-src 'none'`, scripts só da própria origem,
`connect-src` só a origem e `resultados.tse.jus.br`), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` e afins em toda
resposta. As fontes (Big Shoulders Display, Public Sans, Spline Sans Mono; licença OFL em `web/fonts/`) são servidas daqui, sem
Google Fonts.
