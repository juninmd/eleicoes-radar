// Classic script, runs before first paint: the view decides which controls exist, so the layout does not jump when app.js loads.
// The link opens on Ao vivo (the saved tab is not restored); deep links keep their own screen. Keep in step with `state.modo` in app.ts.
document.body.dataset.visao = location.hash.startsWith("#cand=") ? "radar" : location.hash.startsWith("#apuracao") ? "apuracao" : location.hash === "#auditoria" ? "auditoria" : location.hash === "#historico" ? "historico" : location.hash === "#camara" ? "camara" : "aovivo";
// Ao vivo is the default screen and its module chain is 5 requests deep: ask for all of it (and its map) now, not as each level is parsed.
// The list is the static import closure of apuracao-aovivo.ts minus what app.js already brings; web/preload.test.ts keeps it exact.
if (document.body.dataset.visao === "aovivo") {
  const add = (rel: string, href: string, extra: Record<string, string> = {}) => {
    const l = document.createElement("link");
    Object.assign(l, { rel, href, ...extra });
    document.head.append(l);
  };
  const modulos = [
    "apuracao-aovivo.js", "apuracao-feed.js", "apuracao-tse.js", "apuracao-ritmo.js", "apuracao-uf.js", "apuracao-turno.js",
    "apuracao-nacional.js", "apuracao-eleito.js", "apuracao-mapa.js", "apuracao-duelo.js", "apuracao-som.js",
    "apuracao-graficos.js", "apuracao-pesquisa.js", "apuracao-eleitos.js", "apuracao-dom.js", "apuracao-aovivo-noticias.js",
    "apuracao-consolidado.js", "apuracao-noite.js", "apuracao-exterior.js", "exterior-cidades.js", "apuracao-fx.js",
    "apuracao-cena.js", "apuracao-zoom.js", "social.js", "social-api.js", "social-push.js", "social-view.js", "mapa-uf-carga.js",
    "apuracao-projecao-estado.js", "apuracao-projecao.js", "apuracao-chance.js", "municipio-modelo.js", "apuracao-municipios.js",
    "apuracao-mount-props.js", "apuracao-previsao.js", "apuracao-previsao-view.js", "apuracao-chance-view.js",
    "apuracao-aovivo-2t.js", "apuracao-aovivo-2t-view.js",
  ];
  for (const m of modulos) add("modulepreload", m);
  add("preload", "mapa-uf.json", { as: "fetch", crossOrigin: "anonymous" });
}
