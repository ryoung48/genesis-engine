import { loadHeritages, type RawHeritage } from "../data-source"

interface HeritageIndex {
	heritages: RawHeritage[]
	/** culture id -> heritage id */
	cultureToHeritage: Map<string, string>
}

let indexPromise: Promise<HeritageIndex> | null = null

export function getHeritageIndex(): Promise<HeritageIndex> {
	if (!indexPromise) {
		indexPromise = loadHeritages().then((heritages) => {
			const cultureToHeritage = new Map<string, string>()
			for (const heritage of heritages) {
				for (const culture of heritage.cultures) {
					cultureToHeritage.set(culture.id, heritage.id)
				}
			}
			return { heritages, cultureToHeritage }
		})
	}
	return indexPromise
}
