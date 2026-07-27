import { CLUSTER } from "@/model/society/language/languages/clusters"
import {
	type Language,
	PhonemeCatalog,
	type WeightedDistribution,
} from "@/model/society/language/languages/types"
import type { ValidTermsParams } from "@/model/society/language/languages/builder/types"

interface CustomClusterParams {
	len?: number
	long_names?: number
	structures?: {
		[PhonemeCatalog.MIDDLE_CONSONANT]: string
		[PhonemeCatalog.MIDDLE_VOWEL]: string
	}
}

/**
 * filters terms that fall in the given set of letters
 * @param prospects
 * @param letters
 * @returns list prospects that pass
 */
const validTerms = ({ prospects, letters }: ValidTermsParams) =>
	prospects.filter((c) => c.split("").every((l) => letters.includes(l)))

function buildDistribution<T>(
	map: WeightedDistribution<T>,
	qty = 1,
): WeightedDistribution<T> {
	const total = map.reduce((sum, { w }) => sum + w, 0)
	return map.map(({ v, w }) => ({
		v,
		w: total === 0 ? 0 : (w / total) * qty,
	}))
}

const randomizePhonemes = (src: Language) => {
	Object.entries(src.basePhonemes).forEach(([k, v]) => {
		const condensed = new Map<string, number>()
		v.forEach((c) => {
			condensed.set(c, (condensed.get(c) || 0) + src.dice.random)
		})
		src.phonemes[k as PhonemeCatalog] = buildDistribution(
			Array.from(condensed, ([v, w]) => ({ v, w })),
			1,
		)
	})
}

const initClusters = (params: {
	src: Language
	shortFirst?: boolean
	shortSurnames?: boolean
	clusters?: Record<string, CustomClusterParams>
}) => {
	const { src, shortSurnames, shortFirst, clusters } = params
	const { ending } = src

	src.clusters = {
		settlement: CLUSTER.spawn({
			src: src,
			key: "settlement",
			ending,
			stopChance: src.articleChance,
			variation: 5,
			longNames: 0.5,
		}),
		wilderness: CLUSTER.spawn({
			src: src,
			key: "wilderness",
			ending,
			stopChance: src.articleChance,
			variation: 5,
			longNames: 0.5,
		}),
		region: CLUSTER.spawn({
			src: src,
			key: "region",
			ending,
			stopChance: src.articleChance,
			variation: 15,
			longNames: 0,
		}),
		culture: CLUSTER.spawn({
			src: src,
			key: "culture",
			ending,
			stopChance: 0,
			variation: 15,
			longNames: 0,
		}),
		male: CLUSTER.spawn({
			src: src,
			key: "male",
			ending,
			stopChance: src.stopChance,
			len: shortFirst ? 1 : clusters?.male?.len,
			longNames: clusters?.male?.long_names || 0.3,
			variation: 15,
		}),
		female: CLUSTER.spawn({
			src: src,
			key: "female",
			ending: PhonemeCatalog.MIDDLE_VOWEL,
			stopChance: src.stopChance,
			variation: 15,
			len: shortFirst ? 1 : clusters?.female?.len,
			longNames: clusters?.female?.long_names || 0,
		}),
		last: CLUSTER.spawn({
			src: src,
			key: "last",
			variation: 15,
			ending,
			stopChance: 0,
			longNames: 0,
			len: shortSurnames ? 1 : 2,
		}),
	}
	// similar first names
	src.clusters.female.patterns = src.clusters.male.patterns
}

export const BUILDER = {
	validTerms,
	randomizePhonemes,
	initClusters,
}
