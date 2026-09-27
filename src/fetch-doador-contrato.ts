// FASE 2 — não roda no pipeline padrão. Cruza doador de campanha (TSE) com
// empresa que ganhou contrato público federal depois (Portal da Transparência).
//
// Bloqueios reais pra rodar isso de ponta a ponta:
// 1. TSE: prestação de contas de campanha é CSV bulk por ano/eleição em
//    https://dadosabertos.tse.jus.br (dataset "prestacao_contas_eleitorais"),
//    dezenas/centenas de MB por ciclo eleitoral — baixar e parsear é factível,
//    mas pesado pra rodar sem pedir antes.
// 2. Portal da Transparência exige API key pessoal (cadastro grátis em
//    https://api.portaldatransparencia.gov.br/swagger-ui/index.html).
//    Sem isso, 0 chamada funciona.
//
// Defina PORTAL_TRANSPARENCIA_TOKEN no ambiente pra habilitar a consulta por CNPJ.

const TOKEN = process.env.PORTAL_TRANSPARENCIA_TOKEN;

export async function consultarContratosPorCnpj(cnpj: string) {
  if (!TOKEN) {
    throw new Error(
      "PORTAL_TRANSPARENCIA_TOKEN não definido. Cadastre em api.portaldatransparencia.gov.br e exporte a variável."
    );
  }
  const res = await fetch(
    `https://api.portaldatransparencia.gov.br/api-de-dados/contratos?codigoOrgao=&cnpjContratado=${cnpj}&pagina=1`,
    { headers: { "chave-api-dados": TOKEN, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Portal Transparência: ${res.status}`);
  return res.json();
}

// TODO Fase 2: baixar prestacao_contas_eleitorais do TSE (dadosabertos.tse.jus.br),
// extrair doador (CNPJ) por candidato, e para cada CNPJ doador chamar
// consultarContratosPorCnpj() verificando contratos com data posterior à doação.
// Não implementado aqui: volume de dados exige decisão explícita (qual eleição,
// qual escopo de UF) antes de baixar centenas de MB.
