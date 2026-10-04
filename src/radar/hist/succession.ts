// Whose votes a party's number inherits from the previous election. A number that is not listed inherits its own,
// which is right for renames that kept it (PMN -> Mobiliza, PMB -> Democrata, PR -> PL). Listed numbers are mergers
// (the sum of the old numbers) or a number reused by a new party (nothing). Keyed by the previous election's year;
// checked against the TSE decisions, and against the data: these are the numbers whose owner changed.
export const SUCCESSION: Record<number, Record<string, string[]>> = {
  // 2018 -> 2022: União Brasil (PSL + DEM), PRP into Patriota, PHS into Podemos, PPL into PCdoB.
  2018: { "44": ["17", "25"], "51": ["51", "44"], "19": ["19", "31"], "65": ["65", "54"] },
  // 2022 -> 2026: PRD (PTB + Patriota), Podemos takes PSC's 20, PROS into Solidariedade, Missão reuses the PTB's 14.
  2022: { "14": [], "20": ["19", "20"], "25": ["14", "51"], "77": ["77", "90"] },
};

export const inherited = (prevYear: number, number: string): string[] => SUCCESSION[prevYear]?.[number] ?? [number];
