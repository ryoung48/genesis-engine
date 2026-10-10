import type {
	ActivateParams,
	CradleChoice,
	CradleParams,
	CradleState,
	HistoricalParams,
	MatureScoreParams,
} from "@/model/history/distribution/cradles/types"
import { UNITS } from "@/model/shared/units"

function matureScore({
	siteScore,
	arrivalYear,
	year,
}: MatureScoreParams): number {
	const age = year - arrivalYear
	return age < 2000 ? 0 : siteScore * Math.min(age / 2000, 2)
}
function create({
	provinces,
	migration,
	siteScore,
	r_xyz,
	planetRadiusKm,
}: CradleParams): CradleState {
	const spacingKm = (2000 * planetRadiusKm) / UNITS.defaultPlanetRadiusKm,
		nearest = new Float64Array(provinces.count).fill(Infinity),
		schedule: CradleChoice[] = []
	const selected = new Set<number>()
	for (let year = -3300; year <= 2025 && schedule.length < 8; year += 100) {
		while (schedule.length < 8) {
			let best = -1,
				score = -Infinity
			for (let p = 0; p < provinces.count; p++) {
				if (
					provinces.desolate[p] ||
					selected.has(p) ||
					year - migration.arrivalYear[p] < 2000 ||
					nearest[p] < spacingKm
				)
					continue
				const value =
					matureScore({
						siteScore: siteScore[p],
						arrivalYear: migration.arrivalYear[p],
						year,
					}) * Math.min(nearest[p] / spacingKm, 2)
				if (value > score || (value === score && p < best)) {
					best = p
					score = value
				}
			}
			if (best < 0) break
			schedule.push({
				province: best,
				selectionYear: year,
				arrivalYear: migration.arrivalYear[best],
				residenceYears: year - migration.arrivalYear[best],
				componentId: migration.componentId[best],
				nearestDistanceKm: nearest[best],
			})
			selected.add(best)
			for (let p = 0; p < provinces.count; p++)
				nearest[p] = Math.min(
					nearest[p],
					UNITS.regionDistanceKm({
						r_xyz,
						fromRegion: p,
						toRegion: best,
						planetRadiusKm,
					}),
				)
		}
	}
	return {
		schedule,
		cursor: 0,
		spacingKm,
		nearestId: new Int32Array(provinces.count).fill(-1),
		nearestDistanceKm: new Float32Array(provinces.count).fill(Infinity),
	}
}
function activate({
	cradles,
	provinces,
	r_xyz,
	planetRadiusKm,
	year,
}: ActivateParams): void {
	while (
		cradles.cursor < cradles.schedule.length &&
		cradles.schedule[cradles.cursor].selectionYear <= year
	) {
		const id = cradles.cursor++,
			choice = cradles.schedule[id]
		for (let p = 0; p < provinces.count; p++) {
			const distance = UNITS.regionDistanceKm({
				r_xyz,
				fromRegion: p,
				toRegion: choice.province,
				planetRadiusKm,
			})
			if (distance < cradles.nearestDistanceKm[p]) {
				cradles.nearestDistanceKm[p] = distance
				cradles.nearestId[p] = id
			}
		}
	}
}
function atYear(params: HistoricalParams): CradleState {
	const cradles = {
		...params.cradles,
		cursor: 0,
		nearestId: new Int32Array(params.provinces.count).fill(-1),
		nearestDistanceKm: new Float32Array(params.provinces.count).fill(Infinity),
	}
	activate({ ...params, cradles })
	return cradles
}
export const DISTRIBUTION_CRADLES = { create, activate, atYear, matureScore }
