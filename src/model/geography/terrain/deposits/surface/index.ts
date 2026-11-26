import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { GROUND } from "@/model/geography/terrain/deposits/ground"
import { SCENE } from "@/model/geography/terrain/deposits/scene"
import type {
	LakeParams,
	PlaceParams,
	SystemValue,
} from "@/model/geography/terrain/deposits/scene/types"
import { STONE } from "@/model/geography/terrain/deposits/stone"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import { LAKES } from "@/model/geography/terrain/lakes"
import { MATH } from "@/model/shared/math/core"

const C = DEPOSIT_CONFIG
const SALT_LAKE = 1
const PAN = 0.85
const COPPER_STRIPPED = [0.6, 1.2] as const
const WET_ROUGH = [0.25, 0.08] as const
const FLATS = 0.75
const BED_WEATHER = 0.7
const GOSSAN_ICE = 0.8
const GOSSAN_YOUNG = 0.8
const ALUM_EPITHERMAL = [0.01, 0.15] as const
const VARIETY_EDGES = [-0.6, 0.6] as const
const VARIETY_OFFSET = { clay: 57.1, sand: 91.9 } as const

function lakeTerm(kind: number): number {
	if (kind === LAKES.kindCode.salt) return SALT_LAKE
	if (kind === LAKES.kindCode.pan) return PAN
	return 0
}

function place({ scene, here }: PlaceParams): void {
	const { fields: F, hosts: T, tests, ground } = scene
	const { region: r, cell: w, rock: rk } = here
	const R = F.record
	const at = (f: Float32Array) => (w >= 0 && f[w] > 0 ? f[w] : 0)
	const district = ({ system, value }: SystemValue) =>
		SCENE.district({ scene, region: r, system, value })
	const put = ({ system, value }: SystemValue) =>
		SCENE.put({ scene, region: r, system, value })
	const variety = (offset: number) =>
		SCENE.spot({
			scene,
			value: 1,
			frequency: scene.spot.reefFreq,
			edges: VARIETY_EDGES,
			offset,
		})
	const rough = ground.rough[r]
	const terms = GROUND.terms({
		relief: ground.relief[r],
		rough,
		plain: here.young,
	})
	const glaciated = here.glaciated ? 1 : 0
	const young = here.young ? 1 : 0
	const bauxite = tests.bauxite[r]
	const evaporite = tests.evaporite[r]
	const arid = tests.arid[r]
	const copperSource = Math.max(here.porphyry, 0.7 * here.vms, 0.5 * here.skarn)
	district({
		system: "ironLaterite",
		value:
			tests.ironLaterite[r] *
			terms.gentle *
			terms.crust *
			T.ironLaterite[rk] *
			(1 - BED_WEATHER * bauxite),
	})
	put({
		system: "supergene",
		value:
			copperSource *
			tests.enrichedCopper[r] *
			(1 - glaciated) *
			(1 - 0.6 * MATH.ramp({ range: COPPER_STRIPPED, x: rough })),
	})
	put({
		system: "gossan",
		value:
			Math.max(
				here.vms,
				here.porphyry,
				here.skarn,
				0.7 * here.mvt,
				0.7 * here.sedex,
			) *
			(1 - GOSSAN_ICE * glaciated) *
			(1 - GOSSAN_YOUNG * young),
	})
	put({
		system: "salt",
		value: Math.max(
			lakeTerm(scene.lakeKind[r]),
			T.saltBed[rk] * (0.6 + 0.4 * evaporite),
			FLATS * evaporite * terms.flat * T.saltFlats[rk] * terms.pan,
		),
	})
	const wetLow =
		Math.sqrt(tests.peat[r]) *
		MATH.ramp({ range: WET_ROUGH, x: rough }) *
		Math.max(0.25, terms.lowFloor) *
		(1 - glaciated)
	district({
		system: "bogIron",
		value: wetLow * (here.till ? 1 : T.bogIron[rk]),
	})
	district({
		system: "opal",
		value: arid * terms.gentle * terms.crust * T.opal[rk],
	})
	district({
		system: "turquoise",
		value: copperSource * arid * (1 - glaciated),
	})
	const coverNow = Math.max(at(R.coverNow), 1e-3)
	here.coal = at(R.coal) * Math.min(1, C.coalMeasuresKm / coverNow) * T.coal[rk]
	district({ system: "coal", value: here.coal })
	district({
		system: "ironstone",
		value: Math.max(
			at(R.ironstone) * C.ironstoneOutcrop * T.ironstone[rk],
			0.5 * here.coal,
		),
	})
	const access = STONE.access({
		young: here.young,
		hills: terms.hills,
		deepRed: Math.max(bauxite, tests.ironLaterite[r]),
		glaciated: here.glaciated,
	})
	const quarry =
		T.stoneHere[rk] > 0.05 && access > 0.05
			? STONE.quarry(scene.shapes.at(SYSTEMS.index.stone))
			: STONE.quarry(0)
	put({
		system: "stone",
		value: STONE.richness({ share: T.stone[rk], access, quarry }),
	})
	put({
		system: "stoneMarble",
		value: STONE.richness({
			share: here.marble * T.marble[rk],
			access,
			quarry,
		}),
	})
	put({
		system: "clay",
		value: STONE.clay({
			host: T.clay[rk],
			hills: terms.hills,
			variety: variety(VARIETY_OFFSET.clay),
		}),
	})
	put({
		system: "sand",
		value: STONE.sand({
			erg: here.erg,
			coastal: scene.coastal[r] === 1,
			sandPercent: scene.sand[r],
			glaciated: here.glaciated,
			variety: variety(VARIETY_OFFSET.sand),
		}),
	})
	const epithermal = MATH.ramp({ range: ALUM_EPITHERMAL, x: at(R.epithermal) })
	district({
		system: "alum",
		value: Math.max(
			C.alumVolcanic * T.alumVolcanic[rk] * epithermal,
			C.alumShale * at(R.shale) * T.alumShale[rk],
		),
	})
	district({ system: "mercury", value: T.mercury[rk] * epithermal })
	district({
		system: "saltpeter",
		value: arid * T.saltpeter[rk] * (1 - glaciated),
	})
	district({
		system: "amber",
		value: scene.coastal[r] === 1 ? at(R.coal) * T.amber[rk] : 0,
	})
}

function lake({ scene, region }: LakeParams): void {
	const value = lakeTerm(scene.lakeKind[region])
	if (value > 0) SCENE.put({ scene, region, system: "salt", value })
}

export const SURFACE = { place, lake }
