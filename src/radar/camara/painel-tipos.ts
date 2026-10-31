// Shape of web/data/camara/painel.json (bun run radar:camara). Types only: the web tab imports them with `import type`.
// Compact on purpose: people and parties are tables, votes are index triples, so 24 roll calls stay near 150 KB.

export const VOTOS = ["Sim", "Não", "Abstenção", "Obstrução", "Outro"] as const;
export type Voto = (typeof VOTOS)[number];

export interface PropRef { sigla: string; numero: string; ano: string; ementa: string; id: number }

export interface VotacaoCamara {
  id: string;
  data: string; // AAAA-MM-DD
  descricao: string;
  aprovada: boolean | null; // flag the Câmara records (aprovacao); null when it does not say
  prop: PropRef | null;
  orient: [tipo: string, nome: string, voto: string][]; // tipo "P" party, "B" bloc/federation/leadership
  votos: [deputado: number, partido: number, voto: number][]; // indexes into deputados, partidos, VOTOS
}

export interface ItemPauta {
  ordem: number;
  topico: string;
  regime: string;
  titulo: string;
  ementa: string;
  parecer: string;
  relator: { nome: string; partido: string; uf: string } | null;
}
export interface EventoPauta {
  id: number;
  inicio: string; // AAAA-MM-DDTHH:MM, Brasília
  fim: string | null;
  situacao: string;
  tipo: string;
  descricao: string;
  local: string;
  orgaos: { sigla: string; nome: string }[];
  pauta: ItemPauta[];
}

export interface Proposicao {
  id: number;
  titulo: string;
  tipo: string;
  ementa: string;
  apresentacao: string; // AAAA-MM-DD
  inteiroTeor: string | null;
  autores: { nome: string; tipo: string }[];
  temas: string[];
  tram: [data: string, orgao: string, tramitacao: string, situacao: string, regime: string, despacho: string][];
}

export interface PainelCamara {
  geradoEm: string; // AAAA-MM-DD of the collection
  deputados: [id: number, nome: string, uf: string][];
  partidos: string[];
  votacoes: VotacaoCamara[]; // newest first
  pauta: EventoPauta[];
  proposicoes: Proposicao[];
}

export type FotosCamara = Record<string, string>; // deputy id -> data: URI (JPEG)
export interface PartidoCamara { nome: string; logo: string | null } // logo: data: URI (PNG) or null
export type PartidosCamara = Record<string, PartidoCamara>;
