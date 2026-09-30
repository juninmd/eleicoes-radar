import { h, moneyShort, titleName } from "./format.js";

const VIA = { campanha: "campanha", cota: "cota parlamentar" };
const dataBr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function empresaLine(e) {
  if (!e) return `<span class="muted">Sem registro na Receita Federal nesta consulta.</span>`;
  const partes = [
    e.situacao && `Situação: <b>${h(titleName(e.situacao))}</b>`,
    e.abertura && `aberta em ${h(dataBr(e.abertura))}`,
    e.porte && h(titleName(e.porte)),
    e.capital !== null && e.capital !== undefined && `capital social ${moneyShort(e.capital)}`,
  ].filter(Boolean);
  return `${partes.join(" · ")}${e.endereco ? `<br><span class="muted">Endereço: ${h(e.endereco)}</span>` : `<br><span class="muted">Endereço não informado.</span>`}`;
}

function outros(f) {
  if (!f.outros) return `<span class="muted">Nenhum outro político do levantamento pagou este fornecedor.</span>`;
  const nomes = f.outrosTop.map((p) => `${h(titleName(p.nome))} (${h(p.partido || p.cargo)}-${h(p.uf)})`).join(", ");
  return `Atendeu também <b>${f.outros}</b> ${f.outros === 1 ? "outro político" : "outros políticos"}${nomes ? `: ${nomes}${f.outros > f.outrosTop.length ? " e mais" : ""}` : ""}.`;
}

export function fornecedoresBlock(list, id) {
  if (!list) return "";
  const rows = list.map((f) => `<li class="forn">
      <div><strong>${h(titleName(f.nome))}</strong>${f.nova ? ` <span class="pill no" title="Aberta menos de um ano antes do primeiro pagamento">empresa nova</span>` : ""} <span class="muted">CNPJ ${h(f.cnpj)}</span><span class="fonte">${moneyShort(f.valor)} · ${f.via.map((v) => VIA[v] ?? v).join(" + ")}</span></div>
      ${f.cnae ? `<small class="muted">${h(f.cnae)}</small>` : ""}
      <p class="small">${empresaLine(f.empresa)}</p>
      <p class="small">${outros(f)}</p>
      ${f.flags.length ? `<p class="flag"><b>Para conferir:</b> ${f.flags.map(h).join("; ")}.</p>` : ""}
    </li>`).join("");
  return `<section><h3>Principais fornecedores <small>pessoas jurídicas pagas com dinheiro público</small></h3>
    <p><button type="button" class="btn-confirma" data-rede-foco="${h(id)}">Ver rede deste candidato</button></p>
    <ul class="forns">${rows}</ul>
    <p class="muted small">Dados do TSE, da cota parlamentar e da Receita Federal. Os sinais não indicam irregularidade: empresas novas, de capital pequeno ou em endereços compartilhados também são legítimas. Confira nos documentos oficiais.</p></section>`;
}
