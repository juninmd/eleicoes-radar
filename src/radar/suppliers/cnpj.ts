// CNPJ helpers: validation (check digits) and formatting. A syntactically invalid CNPJ
// in a spending record is a data-quality signal worth surfacing on its own.
export const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

export function isValidCnpj(raw: string): boolean {
  const d = digits(raw);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    let w = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * w--;
      if (w < 2) w = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const formatCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
