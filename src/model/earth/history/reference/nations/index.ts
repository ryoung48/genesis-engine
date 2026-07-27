import { DATA_SOURCE } from "@/model/earth/history/data-source"
import type { RawNationReference } from "@/model/earth/history/data-source/types"

let indexPromise: Promise<Map<string, RawNationReference>> | null = null

function getNationReferenceIndex(): Promise<Map<string, RawNationReference>> {
	if (!indexPromise) {
		indexPromise = DATA_SOURCE.loadNationReference().then((nations) => {
			const map = new Map<string, RawNationReference>()
			for (const nation of nations) map.set(nation.tag, nation)
			return map
		})
	}
	return indexPromise
}

export const NATIONS = {
	getNationReferenceIndex,
}
