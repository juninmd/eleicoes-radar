// Classic script, runs before first paint: the view decides which controls exist, so the layout does not jump when app.js loads.
// The link opens on Ao vivo (the saved tab is not restored); deep links keep their own screen. Keep in step with `state.modo` in app.ts.
document.body.dataset.visao = location.hash.startsWith("#cand=") ? "radar" : location.hash.startsWith("#apuracao") ? "apuracao" : location.hash === "#auditoria" ? "auditoria" : location.hash === "#camara" ? "camara" : "aovivo";
