// Substantive lawmaking: PL, PLP and PEC where the deputy is the first signer.
// Requests, honours and motions are excluded on purpose — they inflate counts
// without producing law.
import type { Row } from "../csv";

const TYPES = new Set(["PL", "PLP", "PEC"]);
const LAW = /transformad[oa] em norma/i;
// Passed the Chamber: now in the Senate, sanction, veto review or promulgation.
const PASSED = /transformad[oa] em norma|aprecia[cç][aã]o pelo senado|envio ao senado|san[cç][aã]o|aut[oó]grafos|aprecia[cç][aã]o do veto/i;

export interface Bill {
  id: number;
  sigla: string;
  ementa: string;
  situacao: string;
}

export interface BillStats {
  autorPrincipal: number;
  aprovadasCamara: number;
  leis: number;
  destaques: Bill[];
}

export function computeBills(proposicoes: Iterable<Row>, autores: Iterable<Row>): Map<number, BillStats> {
  const bills = new Map<string, Bill & { passed: boolean; law: boolean }>();
  for (const p of proposicoes) {
    if (!TYPES.has(p.siglaTipo ?? "")) continue;
    const situacao = p.ultimoStatus_descricaoSituacao ?? "";
    bills.set(p.id!, {
      id: Number(p.id),
      sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      ementa: (p.ementa ?? "").slice(0, 220),
      situacao,
      passed: PASSED.test(situacao),
      law: LAW.test(situacao),
    });
  }

  const out = new Map<number, BillStats>();
  for (const a of autores) {
    if (a.ordemAssinatura !== "1" || !a.idDeputadoAutor) continue;
    const b = bills.get(a.idProposicao!);
    if (!b) continue;
    const id = Number(a.idDeputadoAutor);
    const s = out.get(id) ?? { autorPrincipal: 0, aprovadasCamara: 0, leis: 0, destaques: [] };
    s.autorPrincipal++;
    if (b.passed) {
      s.aprovadasCamara++;
      if (s.destaques.length < 5) s.destaques.push({ id: b.id, sigla: b.sigla, ementa: b.ementa, situacao: b.situacao });
    }
    if (b.law) s.leis++;
    out.set(id, s);
  }
  return out;
}
