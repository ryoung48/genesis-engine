import { PASTA } from "@/model/climate/classification/pasta"
import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import { CAVES } from "@/model/geography/terrain/caves"
import { GROUNDWATER } from "@/model/geography/terrain/groundwater"
import { KARST } from "@/model/geography/terrain/karst"
import type {
	GenesisKarst,
	KarstCavesComputeParams,
	KarstCavesResult,
	KarstCavesStats,
	KarstCavesStatsParams,
	KarstClass,
	KarstClassOfParams,
	KarstShareParams,
} from "@/model/geography/terrain/karst-caves/types"
import { KARST_CONFIG } from "@/model/geography/terrain/karst-config"
import { MATH } from "@/model/shared/math/core"

const classes: readonly KarstClass[] = [
	"none",
	"absent",
	"short",
	"long",
	"pseudo",
]

const classCode = Object.fromEntries(
	classes.map((kind, i) => [kind, i]),
) as Record<KarstClass, number>

function classOf({
	kind,
	potential,
	lava,
	slopeScore,
}: KarstClassOfParams): number {
	if (lava >= CAVE_CONFIG.caveRange[0]) return classCode.pseudo
	if (kind === KARST.kindCode.none) return classCode.none
	if (potential < CAVE_CONFIG.caveRange[0]) return classCode.absent
	const relief = MATH.ramp({ range: KARST_CONFIG.lengthSlope, x: slopeScore })
	const length =
		potential *
		(KARST_CONFIG.lengthFloor + (1 - KARST_CONFIG.lengthFloor) * relief)
	return length >= KARST_CONFIG.longMin ? classCode.long : classCode.short
}

function share<K extends string>({
	names,
	codes,
	isLand,
	count,
}: KarstShareParams<K>): Record<K, number> {
	const tally = new Float64Array(names.length)
	for (let r = 0; r < codes.length; r++) if (isLand[r]) tally[codes[r]]++
	return Object.fromEntries(
		names.map((name, i) => [name, count > 0 ? tally[i] / count : 0]),
	) as Record<K, number>
}

function statistics({
	isLand,
	shoreLabel,
	karst,
	potentials,
	sites,
	long,
	stageMs,
}: KarstCavesStatsParams): KarstCavesStats {
	let landRegions = 0
	let coastalRegions = 0
	for (let r = 0; r < isLand.length; r++) {
		if (!isLand[r]) continue
		landRegions++
		if (shoreLabel[r] > 0) coastalRegions++
	}
	const presenceShare = {} as KarstCavesStats["presenceShare"]
	CAVES.types.forEach((type, t) => {
		const sea = type === "sea"
		let sum = 0
		for (let r = 0; r < isLand.length; r++) {
			if (!isLand[r] || (sea && shoreLabel[r] === 0)) continue
			sum += MATH.ramp({ range: CAVE_CONFIG.caveRange, x: potentials[t][r] })
		}
		const base = sea ? coastalRegions : landRegions
		presenceShare[type] = base > 0 ? sum / base : 0
	})
	const typeCounts = new Float64Array(CAVES.types.length)
	let solutionType = 0
	let solutionLong = 0
	for (let i = 0; i < sites.type.length; i++) {
		typeCounts[sites.type[i]]++
		if (
			sites.type[i] === CAVES.typeCode.solution ||
			sites.type[i] === CAVES.typeCode.sinkhole
		) {
			solutionType++
			if (long[sites.region[i]]) solutionLong++
		}
	}
	const siteShare = Object.fromEntries(
		CAVES.types.map((type, t) => [
			type,
			sites.type.length > 0 ? typeCounts[t] / sites.type.length : 0,
		]),
	) as KarstCavesStats["siteShare"]
	return {
		landRegions,
		kindShare: share({
			names: KARST.kinds,
			codes: karst.kind,
			isLand,
			count: landRegions,
		}),
		classShare: share({
			names: classes,
			codes: karst.karstClass,
			isLand,
			count: landRegions,
		}),
		activityShare: share({
			names: KARST.activities,
			codes: karst.activity,
			isLand,
			count: landRegions,
		}),
		presenceShare,
		siteShare,
		sitesPer100: landRegions > 0 ? (100 * sites.type.length) / landRegions : 0,
		longSolutionShare: solutionType > 0 ? solutionLong / solutionType : 0,
		stageMs,
	}
}

function compute({
	mesh,
	seed,
	isLand,
	openWater,
	surface,
	groundwater,
	shore,
	volcano,
	topography,
	slopeScore,
	iceMinMonthly,
	pastaClimate,
	climate,
	rainfall,
}: KarstCavesComputeParams): KarstCavesResult {
	const startedAt = performance.now()
	const n = mesh.numRegions
	const regional = GROUNDWATER.regionClimate({
		numRegions: n,
		temperatureMonthly: climate.temperature_monthly,
		temperatureAvg: climate.temperature_avg,
		petMonthly: climate.pet_monthly,
		rainfallAnnual: rainfall.annual,
	})
	const iced = Uint8Array.from(surface.glaciated, (ice, r) =>
		ice || pastaClimate[r] === PASTA.iceCode ? 1 : 0,
	)
	const layers = KARST.classify({
		numRegions: n,
		isLand,
		iced,
		rock: surface.rock,
		bedrock: surface.bedrock,
		rain: regional.rain,
		mean: regional.mean,
		spring: groundwater.spring,
	})
	const potentials = CAVES.potentials({
		isLand,
		karst: layers,
		spring: groundwater.spring,
		rock: surface.rock,
		volcano,
		shoreLabel: shore.label,
		exposureOpenM: shore.exposureOpenM,
		topography,
		slopeScore,
		iceMinMonthly,
		warmest: regional.warmest,
	})
	const lava = potentials[CAVES.typeCode.lava]
	const karstClass = new Uint8Array(n)
	const long = new Uint8Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		karstClass[r] = classOf({
			kind: layers.kind[r],
			potential: layers.potential[r],
			lava: lava[r],
			slopeScore: slopeScore[r],
		})
		if (karstClass[r] === classCode.long) long[r] = 1
	}
	const sites = CAVES.sites({ mesh, seed, isLand, openWater, potentials, long })
	const karst: GenesisKarst = {
		kind: layers.kind,
		karstClass,
		activity: layers.activity,
		potential: layers.potential,
	}
	return {
		karst,
		sites,
		stats: statistics({
			isLand,
			shoreLabel: shore.label,
			karst,
			potentials,
			sites,
			long,
			stageMs: performance.now() - startedAt,
		}),
	}
}

export const KARST_CAVES = { classes, classCode, classOf, compute }
