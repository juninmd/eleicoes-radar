// Sinal fraco de "clã político": agrupa deputados atuais por sobrenome
// compartilhado. Não confirma parentesco (precisaria TSE + cartório), só
// aponta candidatos a checar manualmente.
import { db } from "../db";

const SOBRENOMES_COMUNS = new Set([
  "SILVA", "SANTOS", "SOUZA", "OLIVEIRA", "PEREIRA", "COSTA", "RODRIGUES",
  "ALMEIRA", "ALMEIDA", "FERREIRA", "GOMES", "MARTINS", "ARAUJO", "LIMA",
  "JUNIOR", "FILHO", "NETO", "DE", "DA", "DO", "DOS",
]);

interface Deputado {
  id: number;
  nome: string;
  partido: string;
}

export interface ClaResultado {
  sobrenome: string;
  membros: { id: number; nome: string; partido: string }[];
}

export function analisarParentesco(): ClaResultado[] {
  const deputados = db.query<Deputado, []>(`SELECT id, nome, partido FROM deputados`).all();

  const porSobrenome = new Map<string, Deputado[]>();
  for (const d of deputados) {
    const partes = d.nome.toUpperCase().split(/\s+/);
    const sobrenome = partes[partes.length - 1];
    if (SOBRENOMES_COMUNS.has(sobrenome) || sobrenome.length < 4) continue;
    if (!porSobrenome.has(sobrenome)) porSobrenome.set(sobrenome, []);
    porSobrenome.get(sobrenome)!.push(d);
  }

  const clas: ClaResultado[] = [];
  for (const [sobrenome, membros] of porSobrenome) {
    if (membros.length >= 2) {
      clas.push({
        sobrenome,
        membros: membros.map((m) => ({ id: m.id, nome: m.nome, partido: m.partido })),
      });
    }
  }
  return clas.sort((a, b) => b.membros.length - a.membros.length);
}
