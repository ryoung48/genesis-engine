import type {
	ActivateParams,
	CradleParams,
	CradleState,
	HistoricalParams,
} from "@/model/history/distribution/cradles/types"
import { UNITS } from "@/model/shared/units"
import { MIGRATION } from "@/model/society/migration"

function create({
	provinces,
	migration,
	siteScore,
	r_xyz,
	planetRadiusKm,
}: CradleParams): CradleState {
	return {
		schedule: MIGRATION.cradles({
			provinces,
			arrivalYear: migration.arrivalYear,
			siteScore,
			r_xyz,
			planetRadiusKm,
		}).map((choice) => ({
			...choice,
			componentId: migration.componentId[choice.province],
		})),
		cursor: 0,
		spacingKm: MIGRATION.cradleSpacingKm({ planetRadiusKm }),
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
export const DISTRIBUTION_CRADLES = { create, activate, atYear }
