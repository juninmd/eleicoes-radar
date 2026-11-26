// Classic script, before first paint (same place as boot.ts). Not a module: a module would run too late and flash the wrong theme.
// Keep the rule in step with resolverTema / COR_TEMA in tema.ts. localStorage is wrapped: a private window must not throw.
let salvo: string | null = null;
try { salvo = localStorage.getItem("radar:tema"); } catch { /* silencioso */ }
const prefereClaro = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
const tema = salvo === "light" || salvo === "dark" ? salvo : prefereClaro ? "light" : "dark";
document.documentElement.dataset.theme = tema;
document.documentElement.style.colorScheme = tema;
document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "light" ? "#f4f2f9" : "#0f0b19");
