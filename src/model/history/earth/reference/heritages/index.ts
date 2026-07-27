import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type { HeritageIndex } from "@/model/history/earth/reference/heritages/types"

let indexPromise: Promise<HeritageIndex> | null = null

function getHeritageIndex(): Promise<HeritageIndex> {
	if (!indexPromise) {
		indexPromise = DATA_SOURCE.loadHeritages().then((heritages) => {
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

export const HERITAGES = {
	getHeritageIndex,
}
