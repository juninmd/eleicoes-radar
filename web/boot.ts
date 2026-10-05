// Classic script, runs before first paint: the saved view decides which controls exist, so the layout does not jump when app.js loads.
try { document.body.dataset.visao = JSON.parse(localStorage.getItem("radar:modo") as string) || "radar"; } catch { document.body.dataset.visao = "radar"; }
