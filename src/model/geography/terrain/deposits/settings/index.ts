import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { SCENE } from "@/model/geography/terrain/deposits/scene"
import type {
	PlaceParams,
	SystemValue,
} from "@/model/geography/terrain/deposits/scene/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import { MATH } from "@/model/shared/math/core"

const C = DEPOSIT_CONFIG
const EPS = 0.002
const GAS_DEEP = [1.5, 4] as const
const COVER_THIN_KM = [C.mvtBaseKm[1], C.mvtBaseKm[0]] as const
const EDGE_IN = [0.15, 0.4] as const
const EDGE_OUT = [0.6, 0.9] as const
const KIMBERLITE_CRATON = [0.45, 0.75] as const
const KIMBERLITE_SPOT = [0.7, 0.78] as const
const REEF_SPOT = [0.55, 0.66] as const

function place({ scene, here }: PlaceParams): void {
	const { fields: F, hosts: T, tests, sources } = scene
	const { region: r, cell: w, rock: rk } = here
	const at = (f: Float32Array) => (w >= 0 && f[w] > 0 ? f[w] : 0)
	const district = ({ system, value }: SystemValue) =>
		SCENE.district({ scene, region: r, system, value })
	const put = ({ system, value }: SystemValue) =>
		SCENE.put({ scene, region: r, system, value })
	const R = F.record
	const bared = T.bared[rk]
	let epithermal = 0
	let orogenic = 0
	let tin = 0
	let kimberlite = 0
	let green = 0
	let reef = 0
	if (w >= 0 && F.anyRecord[w] > EPS) {
		here.porphyry = district({
			system: "porphyry",
			value: at(R.porphyry) * bared,
		})
		epithermal = district({
			system: "epithermal",
			value: at(R.epithermal) * T.epithermal[rk],
		})
		orogenic = district({
			system: "orogenicGold",
			value: at(R.orogenicGold) * T.orogenicGold[rk],
		})
		here.vms = district({ system: "vms", value: at(R.vms) * T.vms[rk] })
		here.skarn = district({ system: "skarn", value: at(R.skarn) * T.skarn[rk] })
		here.mvt = district({
			system: "mvt",
			value:
				at(R.mvt) *
				T.mvtRock[rk] *
				(0.45 + 0.55 * MATH.ramp({ range: COVER_THIN_KM, x: at(R.coverNow) })),
		})
		here.sedex = district({
			system: "sedex",
			value: at(R.sedex) * T.sedex[rk],
		})
		tin = district({ system: "tin", value: at(R.tin) * T.tin[rk] })
		const craton = F.edge[w]
		const edge =
			MATH.ramp({ range: EDGE_IN, x: craton }) *
			(1 - MATH.ramp({ range: EDGE_OUT, x: craton }))
		district({
			system: "iocg",
			value: at(R.iocg) * Math.max(edge, 0.25) * bared,
		})
		district({
			system: "magmatic",
			value: at(R.magmatic) * Math.max(edge, 0.2) * T.magmatic[rk],
		})
		district({
			system: "nativeCopper",
			value: at(R.nativeCopper) * T.nativeCopper[rk],
		})
		kimberlite = put({
			system: "kimberlite",
			value:
				SCENE.spot({
					scene,
					value:
						at(R.kimberlite) *
						MATH.ramp({ range: KIMBERLITE_CRATON, x: at(R.craton) }),
					frequency: scene.spot.kimberliteFreq,
					edges: KIMBERLITE_SPOT,
					offset: 3.3,
				}) * T.kimberlite[rk],
		})
		green = district({
			system: "greenstoneGold",
			value: at(R.greenstone) * T.greenstone[rk],
		})
		district({
			system: "bif",
			value:
				at(R.bif) *
				Math.max(T.bifKeel[rk], 0.7 * edge * T.bifBasin[rk]) *
				(0.7 + 0.5 * tests.ironLaterite[r]),
		})
		district({
			system: "ironVein",
			value: at(R.ironVein) * T.ironVein[rk],
		})
		district({ system: "ioa", value: at(R.ioa) * T.ioa[rk] })
		reef = put({
			system: "reef",
			value:
				SCENE.spot({
					scene,
					value: at(R.reef),
					frequency: scene.spot.reefFreq,
					edges: REEF_SPOT,
					offset: 31.7,
				}) * T.reef[rk],
		})
		district({
			system: "oil",
			value:
				at(R.oil) *
				T.petroleum[rk] *
				(C.trapFloor + (1 - C.trapFloor) * C.oilArch),
		})
		district({
			system: "gas",
			value:
				at(R.gas) *
				T.petroleum[rk] *
				(0.5 +
					0.5 *
						Math.max(
							C.oilArch,
							MATH.ramp({ range: GAS_DEEP, x: at(R.coverNow) }),
						)),
		})
		const shaleBed =
			T.oilShaleBed[rk] *
			Math.min(1, C.oilShaleKm / Math.max(at(R.coverNow), 1e-3))
		district({
			system: "bitumen",
			value: Math.max(at(R.bitumen) * T.bitumen[rk], at(R.oilShale) * shaleBed),
		})
	}
	sources.gold[r] = Math.max(
		bared * Math.max(orogenic, epithermal, green, 0.6 * here.porphyry),
		0.4 * reef,
	)
	sources.tin[r] = tin
	sources.diamond[r] = kimberlite
	let corundum = 0
	let basaltGem = 0
	let pegmatite = 0
	if (w >= 0 && F.anyGem[w] > EPS) {
		const peg = at(R.pegmatite)
		here.marble = at(R.marble)
		pegmatite = district({
			system: "pegmatite",
			value: peg * T.pegmatite[rk],
		})
		district({
			system: "emerald",
			value: Math.max(
				peg * T.emeraldPegmatite[rk],
				at(R.foldShale) * T.emeraldShale[rk],
			),
		})
		corundum = district({
			system: "corundum",
			value: here.marble * T.corundum[rk],
		})
		district({ system: "lapis", value: here.marble * T.lapis[rk] })
		basaltGem = district({
			system: "basaltGems",
			value: at(R.hotspot) * T.basaltGems[rk],
		})
		district({ system: "amethyst", value: at(R.lip) * T.amethyst[rk] })
	}
	const garnet = district({ system: "garnet", value: T.garnet[rk] })
	sources.gem[r] =
		bared * Math.max(corundum, 0.8 * basaltGem, 0.5 * pegmatite, 0.25 * garnet)
}

function shelf({ scene, here }: PlaceParams): void {
	const { shelfOil, shelfGas } = scene.fields.record
	const w = here.cell
	for (const [system, field] of [
		["oil", shelfOil],
		["gas", shelfGas],
	] as const) {
		if (!(field[w] > 0)) continue
		const k = SYSTEMS.index[system]
		const boosted =
			scene.scale[k] *
			C.shelfGain *
			field[w] *
			(C.shelfDistrictFloor + (1 - C.shelfDistrictFloor) * scene.shapes.at(k))
		SCENE.put({
			scene,
			region: here.region,
			system,
			value:
				SCENE.stretch({ value: boosted, factor: C.shelfStretch }) /
				scene.scale[k],
		})
	}
}

export const SETTINGS = { place, shelf }
