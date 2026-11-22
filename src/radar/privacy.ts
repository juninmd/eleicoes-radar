// Individuals registered as suppliers (MEI, sole traders) carry their CPF in the name, either
// formatted ("NAME CPF: 123.456.789-01") or as 11 loose digits ("NAME 12345678901"). Public
// output never ships it. Groups may also be split by spaces or lose a separator ("123 456 789 01",
// "123456789-01"). Digit lookarounds keep 14-digit CNPJs and other numbers intact.
const CPF = /(?:\bCPF:?\s*)?(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}(?!\d)/gi;

export const maskCpf = (s: string) => s.replace(CPF, "(CPF omitido)");
