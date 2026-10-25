// Where the cities abroad of the TSE's municipal file are, for the world map of the "Exterior" view: [latitude, longitude] by name without accents.
// The TSE names them after the consulate or embassy seat; a name that is not here is counted as "sem posição" and left off the map, never guessed.
const T: Record<string, [number, number]> = {
  "WASHINGTON": [38.9, -77], "NOVA YORK": [40.7, -74], "NOVA IORQUE": [40.7, -74], "BOSTON": [42.4, -71.1], "MIAMI": [25.8, -80.2], "ORLANDO": [28.5, -81.4],
  "ATLANTA": [33.7, -84.4], "CHICAGO": [41.9, -87.6], "HOUSTON": [29.8, -95.4], "LOS ANGELES": [34.1, -118.2], "SAO FRANCISCO": [37.8, -122.4], "SAN FRANCISCO": [37.8, -122.4],
  "HARTFORD": [41.8, -72.7], "NEWARK": [40.7, -74.2], "DALLAS": [32.8, -96.8], "DENVER": [39.7, -105], "SEATTLE": [47.6, -122.3], "FILADELFIA": [40, -75.2],
  "OTTAWA": [45.4, -75.7], "TORONTO": [43.7, -79.4], "MONTREAL": [45.5, -73.6], "VANCOUVER": [49.3, -123.1], "CIDADE DO MEXICO": [19.4, -99.1], "MEXICO": [19.4, -99.1],
  "HAVANA": [23.1, -82.4], "KINGSTON": [18, -76.8], "PORT OF SPAIN": [10.7, -61.5], "GEORGETOWN": [6.8, -58.2], "PARAMARIBO": [5.9, -55.2], "CAIENA": [4.9, -52.3],
  "PANAMA": [9, -79.5], "CIDADE DO PANAMA": [9, -79.5], "SAN JOSE": [9.9, -84.1], "GUATEMALA": [14.6, -90.5], "SAN SALVADOR": [13.7, -89.2], "TEGUCIGALPA": [14.1, -87.2],
  "MANAGUA": [12.1, -86.3], "SANTO DOMINGO": [18.5, -69.9], "PORTO PRINCIPE": [18.5, -72.3], "BRIDGETOWN": [13.1, -59.6], "NASSAU": [25, -77.4],
  "BUENOS AIRES": [-34.6, -58.4], "MONTEVIDEU": [-34.9, -56.2], "ASSUNCAO": [-25.3, -57.6], "SANTIAGO": [-33.4, -70.7], "LA PAZ": [-16.5, -68.1], "SANTA CRUZ DE LA SIERRA": [-17.8, -63.2],
  "LIMA": [-12, -77], "QUITO": [-0.2, -78.5], "BOGOTA": [4.7, -74.1], "CARACAS": [10.5, -66.9], "ENCARNACION": [-27.3, -55.9], "CIUDAD DEL ESTE": [-25.5, -54.6],
  "PUERTO IGUAZU": [-25.6, -54.6], "CONCEPCION": [-23.4, -57.4], "PUCALLPA": [-8.4, -74.5], "RIO BRANCO": [-9.97, -67.8],
  "LISBOA": [38.7, -9.1], "PORTO": [41.2, -8.6], "FARO": [37, -7.9], "MADRI": [40.4, -3.7], "BARCELONA": [41.4, 2.2], "BILBAU": [43.3, -2.9], "VIGO": [42.2, -8.7], "SEVILHA": [37.4, -6],
  "PARIS": [48.9, 2.4], "LYON": [45.8, 4.8], "MARSELHA": [43.3, 5.4], "LONDRES": [51.5, -0.1], "EDIMBURGO": [55.95, -3.2], "MANCHESTER": [53.5, -2.2], "DUBLIN": [53.3, -6.3],
  "ROMA": [41.9, 12.5], "MILAO": [45.5, 9.2], "VENEZA": [45.4, 12.3], "FLORENCA": [43.8, 11.3], "TURIM": [45.1, 7.7], "BOLONHA": [44.5, 11.3], "NAPOLES": [40.85, 14.3],
  "BERLIM": [52.5, 13.4], "FRANKFURT": [50.1, 8.7], "MUNIQUE": [48.1, 11.6], "HAMBURGO": [53.6, 10], "COLONIA": [50.9, 7], "STUTTGART": [48.8, 9.2], "DUSSELDORF": [51.2, 6.8],
  "BRUXELAS": [50.85, 4.35], "AMSTERDA": [52.4, 4.9], "HAIA": [52.1, 4.3], "LUXEMBURGO": [49.6, 6.1], "GENEBRA": [46.2, 6.1], "BERNA": [46.9, 7.4], "ZURIQUE": [47.4, 8.5],
  "VIENA": [48.2, 16.4], "PRAGA": [50.1, 14.4], "VARSOVIA": [52.2, 21], "BUDAPESTE": [47.5, 19.1], "BUCARESTE": [44.4, 26.1], "ATENAS": [38, 23.7], "SOFIA": [42.7, 23.3],
  "ESTOCOLMO": [59.3, 18.1], "OSLO": [59.9, 10.7], "COPENHAGUE": [55.7, 12.6], "HELSINQUE": [60.2, 24.9], "MOSCOU": [55.75, 37.6], "KIEV": [50.45, 30.5], "BELGRADO": [44.8, 20.5],
  "ZAGREBE": [45.8, 16], "ANKARA": [39.9, 32.9], "ISTAMBUL": [41, 29], "VATICANO": [41.9, 12.45], "SANTA SE": [41.9, 12.45], "MONACO": [43.7, 7.4],
  "TEL AVIV": [32.1, 34.8], "JERUSALEM": [31.8, 35.2], "BEIRUTE": [33.9, 35.5], "AMA": [31.95, 35.9], "AMAN": [31.95, 35.9], "CAIRO": [30, 31.2], "RIAD": [24.7, 46.7], "JEDA": [21.5, 39.2],
  "ABU DABI": [24.5, 54.4], "DUBAI": [25.2, 55.3], "DOHA": [25.3, 51.5], "CUAITE": [29.4, 48], "TEERA": [35.7, 51.4], "BAGDA": [33.3, 44.4],
  "PRETORIA": [-25.7, 28.2], "JOANESBURGO": [-26.2, 28], "CIDADE DO CABO": [-33.9, 18.4], "MAPUTO": [-25.97, 32.6], "LUANDA": [-8.8, 13.2], "LAGOS": [6.5, 3.4], "ABUJA": [9.1, 7.5],
  "ACRA": [5.6, -0.2], "DACAR": [14.7, -17.5], "RABAT": [34, -6.8], "ARGEL": [36.75, 3.05], "TUNIS": [36.8, 10.2], "ADIS ABEBA": [9, 38.7], "NAIROBI": [-1.3, 36.8], "DAR ES SALAM": [-6.8, 39.3],
  "PRAIA": [14.9, -23.5], "BISSAU": [11.9, -15.6], "SAO TOME": [0.3, 6.7], "WINDHOEK": [-22.6, 17.1], "HARARE": [-17.8, 31], "KINSHASA": [-4.3, 15.3], "LIBREVILLE": [0.4, 9.45],
  "TOQUIO": [35.7, 139.7], "NAGOIA": [35.2, 136.9], "HAMAMATSU": [34.7, 137.7], "OSAKA": [34.7, 135.5], "SEUL": [37.55, 127], "PEQUIM": [39.9, 116.4], "XANGAI": [31.2, 121.5],
  "CANTAO": [23.1, 113.3], "HONG KONG": [22.3, 114.2], "TAIPE": [25, 121.5], "SINGAPURA": [1.35, 103.8], "BANGKOK": [13.75, 100.5], "HANOI": [21, 105.8], "JACARTA": [-6.2, 106.8],
  "KUALA LUMPUR": [3.1, 101.7], "MANILA": [14.6, 121], "NOVA DELI": [28.6, 77.2], "MUMBAI": [19.1, 72.9], "ISLAMABADE": [33.7, 73.05], "DACA": [23.8, 90.4], "COLOMBO": [6.9, 79.9],
  "CANBERRA": [-35.3, 149.1], "SYDNEY": [-33.9, 151.2], "SIDNEY": [-33.9, 151.2], "MELBOURNE": [-37.8, 145], "PERTH": [-31.95, 115.9], "BRISBANE": [-27.5, 153], "WELLINGTON": [-41.3, 174.8], "AUCKLAND": [-36.85, 174.8],
};
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
export const posicaoCidade = (nome: string): [lat: number, lon: number] | null => T[norm(nome)] ?? null;
