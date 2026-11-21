// Shared loader for the lazily loaded tabs: a non-2xx answer is an error, so a 404 never renders as empty data.
export type Ler = <T>(caminho: string) => Promise<T>;

export const lerJson: Ler = async <T>(caminho: string) => {
	const r = await fetch(caminho);
	if (!r.ok) throw new Error(`${r.status} ${caminho}`);
	return (await r.json()) as T;
};
