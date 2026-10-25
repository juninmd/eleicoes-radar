# Deploy

Volta para o [README](../README.md).

Imagem `ghcr.io/juninmd/eleicoes-radar` (`Dockerfile`: `web/`, `src/radar/serve.ts` e `src/radar/aovivo/`), servida em
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

## Ao vivo: segredos do push

O push precisa de chaves VAPID num Secret (sem elas o push fica desligado e o resto funciona):

```sh
bun run radar:vapid > ../vapid.env          # fora do repositório; guarda a privada
# no cluster (a privada vai por stdin, não por argumento):
kubectl -n apps create secret generic eleicoes-radar-vapid --from-env-file=/dev/stdin <<< "$(cat ../vapid.env; echo VAPID_SUBJECT=mailto:operador@exemplo.org)"
kubectl -n apps set env deploy/eleicoes-radar --from=secret/eleicoes-radar-vapid
```

Trocar a chave pública invalida as inscrições push. Presença, torcida e inscrições ficam só em memória: todo deploy as zera.

## Deploy com o ArgoCD e o CI (ordem importa)

Existe um Application do ArgoCD (`argocd/eleicoes-radar`, `juninmd/app-charts`, `eleicoes-radar/`, com `selfHeal` e `prune`) e a imagem no git é `:latest`. Dois efeitos:

- `kubectl set image` para uma tag de sha é **revertido pelo Argo em ~1 s**. Não use.
- O CI (`Build and Push Docker Image`) publica `:latest` **sem `web/data`** logo depois de cada merge em `main`.

Ordem que funciona: faça o merge, **espere o job de Docker do CI terminar** (`gh run list --branch main`), então publique a sua imagem (com dados) como `:latest`, reinicie e confira que não é a imagem do CI:

```sh
docker build --platform linux/amd64 -t ghcr.io/juninmd/eleicoes-radar:<sha> -t ghcr.io/juninmd/eleicoes-radar:latest .
docker push ghcr.io/juninmd/eleicoes-radar:<sha> && docker push ghcr.io/juninmd/eleicoes-radar:latest
kubectl -n apps rollout restart deploy/eleicoes-radar && kubectl -n apps rollout status deploy/eleicoes-radar
curl -s https://eleicoes-radar.antonio-code.duckdns.org/data/meta.json | head -3   # 404 = imagem do CI, sem dados
```

Qualquer reinício do pod depois de um merge sem esse passo sobe a imagem do CI e o site perde os dados. O envio (`set env --from=secret`) do Secret VAPID não vem do git: se o Argo o podar, o push se desliga (a página esconde o botão) até reaplicar.

O servidor (`src/radar/serve.ts`) envia `Content-Security-Policy` restritiva (`default-src 'none'`, scripts só da própria origem,
`connect-src` só a origem e `resultados.tse.jus.br`), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` e afins em toda
resposta. As fontes (Big Shoulders Display, Public Sans, Spline Sans Mono; licença OFL em `web/fonts/`) são servidas daqui, sem
Google Fonts.
