// Coleta via API REST da Câmara (dadosabertos.camara.leg.br) — sem chave.
import { db } from "./db";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const UF = process.env.UF ?? "SP";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

interface Deputado {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto: string;
  email: string;
}

export async function coletarDeputados(): Promise<Deputado[]> {
  const json = await getJson(`${BASE}/deputados?siglaUf=${UF}&itens=100`);
  const deputados: Deputado[] = json.dados;

  const insert = db.prepare(
    `INSERT INTO deputados (id, nome, partido, uf, urlFoto, email)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, partido=excluded.partido, urlFoto=excluded.urlFoto, email=excluded.email`
  );
  for (const d of deputados) {
    insert.run(d.id, d.nome, d.siglaPartido, d.siglaUf, d.urlFoto, d.email);
  }
  console.log(`[deputados] ${deputados.length} deputados de ${UF} salvos`);
  return deputados;
}

async function paginar(urlBase: string, onPage: (dados: any[]) => void) {
  let pagina = 1;
  while (true) {
    const url = `${urlBase}${urlBase.includes("?") ? "&" : "?"}pagina=${pagina}&itens=100`;
    const json = await getJson(url);
    const dados: any[] = json.dados ?? [];
    if (dados.length === 0) break;
    onPage(dados);
    pagina++;
    await sleep(120); // gentil com a API pública
    if (pagina > 20) break; // trava de segurança (2000 itens)
  }
}

export async function coletarProposicoes(deputados: Deputado[]) {
  const insert = db.prepare(
    `INSERT OR REPLACE INTO proposicoes (id, deputadoId, siglaTipo, ano, ementa, dataApresentacao, descricaoSituacao, aprovada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let total = 0;
  for (const dep of deputados) {
    await paginar(
      `${BASE}/proposicoes?idDeputadoAutor=${dep.id}&ordem=DESC&ordenarPor=id`,
      (dados) => {
        for (const p of dados) {
          insert.run(p.id, dep.id, p.siglaTipo, p.ano, p.ementa, p.dataApresentacao, null, 0);
          total++;
        }
      }
    );
  }
  console.log(`[proposicoes] ${total} proposições salvas (autoria)`);
}

// Consulta o status de tramitação individualmente só para proposições
// ainda sem status salvo (situação define o índice fantasma).
export async function enriquecerStatusProposicoes() {
  const pendentes = db
    .query<{ id: number }, []>(`SELECT id FROM proposicoes WHERE descricaoSituacao IS NULL`)
    .all();
  console.log(`[status] consultando situação de ${pendentes.length} proposições...`);
  const update = db.prepare(
    `UPDATE proposicoes SET descricaoSituacao = ?, aprovada = ? WHERE id = ?`
  );
  let i = 0;
  for (const { id } of pendentes) {
    try {
      const json = await getJson(`${BASE}/proposicoes/${id}`);
      const situacao: string = json.dados?.statusProposicao?.descricaoSituacao ?? "Desconhecida";
      const aprovada = /transformad[ao] em norma|sancionad|promulgad/i.test(situacao) ? 1 : 0;
      update.run(situacao, aprovada, id);
    } catch (e) {
      console.warn(`  falhou proposicao ${id}: ${(e as Error).message}`);
    }
    i++;
    if (i % 50 === 0) console.log(`  ${i}/${pendentes.length}`);
    await sleep(80);
  }
}

export async function coletarDiscursos(deputados: Deputado[]) {
  const insert = db.prepare(
    `INSERT INTO discursos (deputadoId, dataHoraInicio, sumario) VALUES (?, ?, ?)`
  );
  db.exec("DELETE FROM discursos"); // recoleta simples, volume pequeno
  const dataIni = "2024-01-01";
  let total = 0;
  for (const dep of deputados) {
    await paginar(
      `${BASE}/deputados/${dep.id}/discursos?dataInicio=${dataIni}&ordenarPor=dataHoraInicio&ordem=DESC`,
      (dados) => {
        for (const d of dados) {
          insert.run(dep.id, d.dataHoraInicio, d.sumario ?? "");
          total++;
        }
      }
    );
  }
  console.log(`[discursos] ${total} discursos salvos (desde ${dataIni})`);
}
