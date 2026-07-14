import { loadNationReference, type RawNationReference } from "../data-source"

let indexPromise: Promise<Map<string, RawNationReference>> | null = null

/** tag -> static reference (color, name, initial government, etc). */
export function getNationReferenceIndex(): Promise<
	Map<string, RawNationReference>
> {
	if (!indexPromise) {
		indexPromise = loadNationReference().then((nations) => {
			const map = new Map<string, RawNationReference>()
			for (const nation of nations) map.set(nation.tag, nation)
			return map
		})
	}
	return indexPromise
}
