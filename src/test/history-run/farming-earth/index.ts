import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { MATH } from "@/model/shared/math/core"
import type { WayOfLife } from "@/model/society/farming/types"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type {
	CentreRecord,
	CentresParams,
	DensityDistribution,
	DistanceParams,
	DistributionParams,
	DominantParams,
	ErrorSummaryParams,
	ExpertLevelsParams,
	FrontSpeedParams,
	HydeCompareParams,
	HydeComparison,
	HydeSeries,
	InsideParams,
	LanduseRow,
	Mode,
	NearestParams,
	NearestResult,
	PercentileParams,
	PinhasiParams,
	PinhasiSite,
	ProvincePoints,
	ProvincePointsParams,
	ReferenceData,
	RegionFeature,
	RegionMembersParams,
	ShareDistanceParams,
	SourceRecord,
	TechLevelAtParams,
	TechLevelCheckParams,
	WayOfLifeParams,
	WorktreeWayOfLifeParams,
} from "@/test/history-run/farming-earth/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

const REFERENCE_DIR = join("stats", "reference-data", "farming-earth")
const MATCH_KM = 350
const WORKTREE_MATCH_KM = 250
const ADOPTION_KM = 700
const EARTH_RADIUS_KM = 6371
const BAND_KM = 1000
const SENTINEL = 2147483647
const RAD = Math.PI / 180
const MODES: Mode[] = ["forage", "herd", "farm"]
const TIE_ORDER: Record<Mode, number> = { farm: 2, herd: 1, forage: 0 }
const LEVEL_RANK: Record<string, number> = {
	Widespread: 3,
	Common: 2,
	Minimal: 1,
}

// Curated coordinates and onset estimates in years before 1950, from the pinned
// upstream revision 632f0ec675d1d61b6d131514a923e25b59601840,
// tuning/farming/earth-history.mjs CENTRES.
const CENTRES: CentreRecord[] = [
	{ name: "Fertile Crescent", latitude: 36.5, longitude: 40, bp: 11500 },
	{ name: "Yangtze", latitude: 30, longitude: 113, bp: 9000 },
	{ name: "Yellow River", latitude: 35.5, longitude: 111, bp: 9500 },
	{ name: "Balsas, Mexico", latitude: 18.3, longitude: -100, bp: 9000 },
	{ name: "Eastern N America", latitude: 37, longitude: -87, bp: 5000 },
	{ name: "Central Andes", latitude: -13.5, longitude: -72, bp: 8000 },
	{ name: "SW Amazonia", latitude: -12, longitude: -65, bp: 9000 },
	{ name: "New Guinea highlands", latitude: -5.8, longitude: 144.3, bp: 8000 },
	{ name: "West African Sahel", latitude: 15, longitude: -2, bp: 4500 },
	{ name: "Sudan (sorghum)", latitude: 14, longitude: 33, bp: 5000 },
	{ name: "Ethiopian highlands", latitude: 9, longitude: 38.5, bp: 5000 },
	{ name: "West African yam belt", latitude: 7.5, longitude: 2, bp: 4000 },
	{ name: "Ganges", latitude: 25.5, longitude: 83, bp: 7000 },
	{ name: "South India", latitude: 15, longitude: 77, bp: 4500 },
]

const ASSET_DIR = join("public", "earth-data")
const ASSET_FILES = [
	"earth.png",
	"coastline-mask.png",
	"lake-mask.png",
	"river-lines.json",
	"earth-real-temperature.json",
	"earth-real-precipitation.json",
	"earth-real-dtr.json",
	"earth-real-elevation.json",
]

function assetDigests(): { file: string; sha256: string | null }[] {
	const digest = (file: string) => {
		const path = join(ASSET_DIR, file)
		return existsSync(path)
			? createHash("sha256").update(readFileSync(path)).digest("hex")
			: null
	}
	const files = [...ASSET_FILES]
	for (const file of ASSET_FILES) {
		const path = join(ASSET_DIR, file)
		if (!file.endsWith(".json") || !existsSync(path)) continue
		const bin = (JSON.parse(readFileSync(path, "utf8")) as { bin?: string }).bin
		if (bin) files.push(bin)
	}
	return files.map((file) => ({ file, sha256: digest(file) }))
}

function csv(path: string): string[][] {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.filter((line) => line.length)
		.map((line) => {
			const cells: string[] = []
			let cell = ""
			let quoted = false
			for (const ch of line) {
				if (ch === '"') quoted = !quoted
				else if (ch === "," && !quoted) {
					cells.push(cell)
					cell = ""
				} else cell += ch
			}
			cells.push(cell)
			return cells
		})
}

function loadReference(): ReferenceData {
	const missing: string[] = []
	const read = <T>(file: string, parse: (path: string) => T): T | null => {
		const path = join(REFERENCE_DIR, file)
		if (!existsSync(path)) {
			missing.push(file)
			return null
		}
		return parse(path)
	}
	return {
		sites: read("pinhasi-2005.csv", (path) =>
			csv(path)
				.slice(1)
				.map(
					(row): PinhasiSite => ({
						site: row[0],
						latitude: Number(row[1]),
						longitude: Number(row[2]),
						year: 1950 - Number(row[3]),
						sd: Number(row[4]),
					}),
				),
		),
		regions: read("archaeoglobe-regions.geojson", (path) =>
			(
				JSON.parse(readFileSync(path, "utf8")) as {
					features: {
						properties: { id: number; name: string }
						geometry: { coordinates: [number, number][][] }
					}[]
				}
			).features.map(
				(feature): RegionFeature => ({
					id: feature.properties.id,
					name: feature.properties.name,
					rings: feature.geometry.coordinates,
				}),
			),
		),
		landuse: read("archaeoglobe-landuse.csv", (path) =>
			csv(path)
				.slice(1)
				.map(
					(row): LanduseRow => ({
						regionId: Number(row[0]),
						wayOfLife: row[3] as Mode,
						year: Number(row[5]),
						level: row[6],
					}),
				),
		),
		sources: read(
			"sources.json",
			(path) =>
				(JSON.parse(readFileSync(path, "utf8")) as { sources: SourceRecord[] })
					.sources,
		),
		missing,
	}
}

function distanceKm({ aLat, aLon, bLat, bLon }: DistanceParams): number {
	const dot =
		Math.sin(aLat * RAD) * Math.sin(bLat * RAD) +
		Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((aLon - bLon) * RAD)
	return Math.acos(Math.max(-1, Math.min(1, dot))) * EARTH_RADIUS_KM
}

function percentile({ values, fraction }: PercentileParams): number | null {
	if (!values.length) return null
	const sorted = values.toSorted((a, b) => a - b)
	return sorted[Math.floor((sorted.length - 1) * fraction)]
}

function provincePoints({
	seeds,
	r_xyz,
}: ProvincePointsParams): ProvincePoints {
	const latDeg = new Float64Array(seeds.length)
	const lonDeg = new Float64Array(seeds.length)
	seeds.forEach((region, p) => {
		const x = r_xyz[region * 3]
		const y = r_xyz[region * 3 + 1]
		const z = r_xyz[region * 3 + 2]
		latDeg[p] = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		lonDeg[p] = (Math.atan2(y, x) * 180) / Math.PI
	})
	return { latDeg, lonDeg }
}

function nearest({
	latitude,
	longitude,
	points,
	mask,
}: NearestParams): NearestResult {
	let best = -1
	let bestKm = Infinity
	for (let p = 0; p < mask.length; p++) {
		if (!mask[p]) continue
		const d = distanceKm({
			aLat: latitude,
			aLon: longitude,
			bLat: points.latDeg[p],
			bLon: points.lonDeg[p],
		})
		if (d < bestKm) {
			bestKm = d
			best = p
		}
	}
	return { province: best, distanceKm: bestKm }
}

function frontSpeed({ distances, years }: FrontSpeedParams) {
	const n = distances.length
	if (n < 3) return { samples: n, kmPerYear: null }
	const md = distances.reduce((s, v) => s + v, 0) / n
	const my = years.reduce((s, v) => s + v, 0) / n
	let cov = 0
	let vd = 0
	for (let i = 0; i < n; i++) {
		cov += (distances[i] - md) * (years[i] - my)
		vd += (distances[i] - md) ** 2
	}
	return { samples: n, kmPerYear: cov > 0 ? vd / cov : null }
}

function errorSummary({ errors }: ErrorSummaryParams) {
	return {
		samples: errors.length,
		median: percentile({ values: errors, fraction: 0.5 }),
		p10: percentile({ values: errors, fraction: 0.1 }),
		p90: percentile({ values: errors, fraction: 0.9 }),
		meanAbsolute: errors.length
			? errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length
			: null,
	}
}

function centres({ points, mask, farmingYear, hearths }: CentresParams) {
	const fired = hearths.filter((hearth) => hearth.fired)
	const rows = CENTRES.map((centre) => {
		let hearthKm = Infinity
		for (const hearth of fired)
			hearthKm = Math.min(
				hearthKm,
				distanceKm({
					aLat: centre.latitude,
					aLon: centre.longitude,
					bLat: points.latDeg[hearth.province],
					bLon: points.lonDeg[hearth.province],
				}),
			)
		const match = nearest({
			latitude: centre.latitude,
			longitude: centre.longitude,
			points,
			mask,
		})
		const matched = match.province >= 0 && match.distanceKm <= MATCH_KM
		const year = matched ? farmingYear[match.province] : null
		return {
			...centre,
			referenceYear: 1950 - centre.bp,
			nearestFiredHearthKm: Number.isFinite(hearthKm) ? hearthKm : null,
			withinAdoptionRadius: hearthKm <= ADOPTION_KM,
			matchKm: Math.round(match.distanceKm),
			modelFarmingYear: year === SENTINEL ? "unreached" : year,
		}
	})
	return {
		upstreamAucContext: 0.755,
		adoptionRadiusKm: ADOPTION_KM,
		withinAdoptionRadiusShare:
			rows.filter((row) => row.withinAdoptionRadius).length / rows.length,
		rows,
	}
}

function pinhasi({ sites, points, mask, farmingYear }: PinhasiParams) {
	const origin = sites.reduce((first, s) => (s.year < first.year ? s : first))
	const fromOrigin = (s: PinhasiSite) =>
		distanceKm({
			aLat: origin.latitude,
			aLon: origin.longitude,
			bLat: s.latitude,
			bLon: s.longitude,
		})
	const unmatched: string[] = []
	let unreached = 0
	const rows: { site: PinhasiSite; model: number; band: number }[] = []
	for (const site of sites) {
		const match = nearest({
			latitude: site.latitude,
			longitude: site.longitude,
			points,
			mask,
		})
		if (match.province < 0 || match.distanceKm > MATCH_KM) {
			unmatched.push(site.site)
			continue
		}
		const model = farmingYear[match.province]
		if (model === SENTINEL) {
			unreached++
			continue
		}
		rows.push({ site, model, band: Math.floor(fromOrigin(site) / BAND_KM) })
	}
	const errors = rows.map((row) => row.model - row.site.year)
	const bands: Record<string, ReturnType<typeof errorSummary>> = {}
	for (const band of [...new Set(rows.map((row) => row.band))].sort(
		(a, b) => a - b,
	))
		bands[`${band * BAND_KM}-${(band + 1) * BAND_KM} km`] = errorSummary({
			errors: rows
				.filter((row) => row.band === band)
				.map((row) => row.model - row.site.year),
		})
	const share = (hit: (row: (typeof rows)[number]) => boolean) =>
		rows.length ? rows.filter(hit).length / rows.length : null
	const distances = rows.map((row) => fromOrigin(row.site))
	return {
		sites: sites.length,
		matched: rows.length + unreached,
		unmatched,
		unreachedByModel: unreached,
		earliestSite: origin.site,
		signedErrorYears: errorSummary({ errors }),
		byDistanceBand: bands,
		withinTwoSd: share(
			(row) =>
				Number.isFinite(row.site.sd) &&
				Math.abs(row.model - row.site.year) <= 2 * row.site.sd,
		),
		withinFiveHundredYears: share(
			(row) => Math.abs(row.model - row.site.year) <= 500,
		),
		observedFrontKmPerYear: frontSpeed({
			distances,
			years: rows.map((row) => row.site.year),
		}),
		modelledFrontKmPerYear: frontSpeed({
			distances,
			years: rows.map((row) => row.model),
		}),
		publishedFrontKmPerYear: [0.6, 1.3],
	}
}

function inside({ region, lat, lon }: InsideParams): boolean {
	let crossings = 0
	for (const ring of region.rings)
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i]
			const [xj, yj] = ring[j]
			if (
				yi > lat !== yj > lat &&
				lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
			)
				crossings++
		}
	return crossings % 2 === 1
}

function regionMembers({
	regions,
	points,
	mask,
}: RegionMembersParams): number[][] {
	const boxes = regions.map((region) => {
		let minX = Infinity
		let maxX = -Infinity
		let minY = Infinity
		let maxY = -Infinity
		for (const ring of region.rings)
			for (const [x, y] of ring) {
				minX = Math.min(minX, x)
				maxX = Math.max(maxX, x)
				minY = Math.min(minY, y)
				maxY = Math.max(maxY, y)
			}
		return { minX, maxX, minY, maxY }
	})
	const members = regions.map(() => [] as number[])
	for (let p = 0; p < mask.length; p++) {
		if (!mask[p]) continue
		const lat = points.latDeg[p]
		const lon = points.lonDeg[p]
		for (let r = 0; r < regions.length; r++) {
			const b = boxes[r]
			if (lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue
			if (inside({ region: regions[r], lat, lon })) {
				members[r].push(p)
				break
			}
		}
	}
	return members
}

function dominant({ score }: DominantParams): Mode {
	return MODES.reduce((best, mode) =>
		score[mode] > score[best] ||
		(score[mode] === score[best] && TIE_ORDER[mode] > TIE_ORDER[best])
			? mode
			: best,
	)
}

function expertLevels({
	landuse,
	regionId,
	year,
}: ExpertLevelsParams): Record<Mode, string> {
	const expert: Record<Mode, string> = {
		forage: "None",
		herd: "None",
		farm: "None",
	}
	for (const row of landuse)
		if (
			row.regionId === regionId &&
			row.year === year &&
			levelRank(row.level) > levelRank(expert[row.wayOfLife])
		)
			expert[row.wayOfLife] = row.level
	return expert
}

function levelRank(level: string): number {
	return LEVEL_RANK[level] ?? 0
}

function worktreePinhasi({ sites, points, mask, farmingYear }: PinhasiParams) {
	const rows: { site: number; model: number }[] = []
	for (const site of sites) {
		let best = Infinity
		for (let p = 0; p < mask.length; p++) {
			if (!mask[p] || farmingYear[p] === SENTINEL) continue
			if (
				distanceKm({
					aLat: site.latitude,
					aLon: site.longitude,
					bLat: points.latDeg[p],
					bLon: points.lonDeg[p],
				}) <= WORKTREE_MATCH_KM
			)
				best = Math.min(best, farmingYear[p])
		}
		if (best !== Infinity) rows.push({ site: site.year, model: best })
	}
	const errors = rows.map((row) => row.model - row.site)
	return {
		definition:
			"fast-history-tech-level worktree (prehistory-earth + farming-earth arrivalOverlay): a site matches when any reached habitable province centre lies within 250 km and takes the earliest farming year among them; sites with none are unmatched, including those whose only nearby provinces are never reached; Spearman is Pearson on average ranks of site year against model year over matched sites; median and absolute error use the lower median, index floor((n-1)/2); absolute is the median of |model - site|",
		sites: sites.length,
		matched: rows.length,
		spearman: REPORT_STATISTICS.spearman({
			a: rows.map((row) => row.site),
			b: rows.map((row) => row.model),
		}),
		medianSignedErrorYears: percentile({ values: errors, fraction: 0.5 }),
		medianAbsoluteErrorYears: percentile({
			values: errors.map(Math.abs),
			fraction: 0.5,
		}),
	}
}

function worktreeWayOfLife({
	regions,
	landuse,
	members,
	modeOf,
}: WorktreeWayOfLifeParams) {
	const slices = [...new Set(landuse.map((row) => row.year))]
		.sort((a, b) => a - b)
		.map((year) => {
			let counted = 0
			let agreeing = 0
			regions.forEach((region, r) => {
				const count: Record<Mode, number> = { forage: 0, herd: 0, farm: 0 }
				let settled = 0
				for (const p of members[r]) {
					const mode = modeOf({ province: p, year })
					if (mode === "uninhabited") continue
					count[mode]++
					settled++
				}
				if (!settled) return
				counted++
				const model = dominant({ score: count })
				if (
					expertLevels({ landuse, regionId: region.id, year })[model] ===
					"Widespread"
				)
					agreeing++
			})
			return {
				year,
				regions: counted,
				agreement: counted ? agreeing / counted : null,
			}
		})
	const scored = slices.filter((slice) => slice.agreement !== null)
	const sum = scored.reduce((total, slice) => total + (slice.agreement ?? 0), 0)
	return {
		definition:
			"fast-history-tech-level worktree (prehistory-earth + farming-earth wayOfLifeOverlay): per slice, regions with at least one province settled by that year count; the model's dominant way of life is the plurality of settled provinces by count (ties farm, herd, forage), not area; the region agrees when the experts rate that way Widespread (the highest level across its rows); agreement is agreeing regions over counted regions; mean and sum are over slices with a score",
		slices,
		sum: scored.length ? sum : null,
		mean: scored.length ? sum / scored.length : null,
	}
}

function wayOfLife({
	regions,
	landuse,
	members,
	areaKm2,
	modeOf,
	capacities,
}: WayOfLifeParams) {
	const rank = levelRank
	const slices = [...new Set(landuse.map((row) => row.year))].sort(
		(a, b) => a - b,
	)
	const mean = (values: Float32Array, provinces: number[]) =>
		provinces.reduce((s, p) => s + values[p], 0) / Math.max(1, provinces.length)
	const sliceRows = slices.map((year) => {
		const confusion: Record<string, Record<string, number>> = {}
		const disagreements: unknown[] = []
		let counted = 0
		let widespread = 0
		let common = 0
		regions.forEach((region, r) => {
			const area: Record<Mode, number> = { forage: 0, herd: 0, farm: 0 }
			let settled = 0
			for (const p of members[r]) {
				const mode: WayOfLife = modeOf({ province: p, year })
				if (mode === "uninhabited") continue
				area[mode] += areaKm2[p]
				settled += areaKm2[p]
			}
			if (settled <= 0) return
			const model = dominant({ score: area })
			const expert = expertLevels({ landuse, regionId: region.id, year })
			const expertDominant = dominant({
				score: {
					forage: rank(expert.forage),
					herd: rank(expert.herd),
					farm: rank(expert.farm),
				},
			})
			counted++
			confusion[model] ??= {}
			confusion[model][expertDominant] =
				(confusion[model][expertDominant] ?? 0) + 1
			if (expert[model] === "Widespread") widespread++
			if (rank(expert[model]) >= LEVEL_RANK.Common) common++
			if (expert[model] !== "Widespread")
				disagreements.push({
					region: region.name,
					modelShares: {
						forage: area.forage / settled,
						herd: area.herd / settled,
						farm: area.farm / settled,
					},
					modelDominant: model,
					expertLevels: expert,
					meanCapacities: {
						forage: mean(capacities.forage, members[r]),
						farm: mean(capacities.farm, members[r]),
						herd: mean(capacities.herd, members[r]),
					},
				})
		})
		return {
			year,
			regions: counted,
			widespreadAgreement: counted ? widespread / counted : null,
			atLeastCommonAgreement: counted ? common / counted : null,
			confusion,
			disagreements,
		}
	})
	const firstSlice = (reached: (year: number) => boolean) => {
		const index = slices.findIndex(reached)
		return index < 0 ? null : index
	}
	const timing = regions.map((region, r) => ({
		region: region.name,
		model: firstSlice((year) =>
			members[r].some((p) => {
				const mode = modeOf({ province: p, year })
				return mode === "farm" || mode === "herd"
			}),
		),
		expert: firstSlice((year) => {
			const expert = expertLevels({ landuse, regionId: region.id, year })
			return rank(expert.farm) >= 1 || rank(expert.herd) >= 1
		}),
	}))
	const differences: number[] = []
	for (const t of timing)
		if (t.model !== null && t.expert !== null)
			differences.push(t.model - t.expert)
	return {
		slices: sliceRows,
		presenceTiming: {
			sliceYears: slices,
			regionsWithoutProvinces: members.filter((m) => !m.length).length,
			signedSliceDifference: errorSummary({ errors: differences }),
			neverFarmedEitherSide: timing.filter(
				(t) => t.model === null && t.expert === null,
			).length,
			modelOnly: timing.filter((t) => t.model !== null && t.expert === null)
				.length,
			expertOnly: timing.filter((t) => t.model === null && t.expert !== null)
				.length,
			regions: timing,
		},
	}
}

const HYDE_JSON = join("public", "earth-data", "earth-real-population-eu4.json")
const HYDE_BIN = join(
	"public",
	"earth-data",
	"earth-real-population-eu4.bin.gz",
)
const DENSITY_EDGES = [1, 6, 11, 31, 51, 101, 500]
const DENSITY_LABELS = [
	"<1",
	"1-5",
	"6-10",
	"11-30",
	"31-50",
	"51-100",
	"101-500",
	">500",
]
const DENSEST_LAND_SHARE = 0.1

function loadHyde(): HydeSeries | null {
	if (!existsSync(HYDE_JSON) || !existsSync(HYDE_BIN)) return null
	const meta = JSON.parse(readFileSync(HYDE_JSON, "utf8"))
	const raw = gunzipSync(readFileSync(HYDE_BIN))
	const values = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
	const count: number = meta.provinceCount
	const years: number[] = meta.times.map((time: string) =>
		Number.parseInt(time.slice(0, time.indexOf("-", 1)), 10),
	)
	const scale: number = meta.encoding.scale
	return {
		years,
		areaKm2: Float64Array.from(meta.provinceAreasKm2 as number[]),
		population: (year) => {
			const t = years.indexOf(year)
			if (t < 0) return null
			return Float64Array.from({ length: count }, (_, i) => {
				const v = values[t * count + i]
				return v === meta.nodata ? 0 : v * scale
			})
		},
	}
}

function densityDistribution({
	cells,
}: DistributionParams): DensityDistribution {
	const bins = DENSITY_LABELS.length
	const population = new Array<number>(bins).fill(0)
	const area = new Array<number>(bins).fill(0)
	let totalPopulation = 0
	let totalAreaKm2 = 0
	const valid = cells.filter((cell) => cell.areaKm2 > 0)
	for (const cell of valid) {
		const density = cell.population / cell.areaKm2
		let bin = 0
		while (bin < DENSITY_EDGES.length && density >= DENSITY_EDGES[bin]) bin++
		population[bin] += cell.population
		area[bin] += cell.areaKm2
		totalPopulation += cell.population
		totalAreaKm2 += cell.areaKm2
	}
	const sorted = [...valid].sort(
		(a, b) => b.population / b.areaKm2 - a.population / a.areaKm2,
	)
	let landSeen = 0
	let densestPopulation = 0
	for (const cell of sorted) {
		if (landSeen >= DENSEST_LAND_SHARE * totalAreaKm2) break
		const take = Math.min(
			1,
			(DENSEST_LAND_SHARE * totalAreaKm2 - landSeen) / cell.areaKm2,
		)
		densestPopulation += cell.population * take
		landSeen += cell.areaKm2 * take
	}
	return {
		totalPopulation,
		totalAreaKm2,
		populationShareByBin: population.map((v) =>
			totalPopulation > 0 ? v / totalPopulation : 0,
		),
		areaShareByBin: area.map((v) => (totalAreaKm2 > 0 ? v / totalAreaKm2 : 0)),
		densestTenthPopulationShare:
			totalPopulation > 0 ? densestPopulation / totalPopulation : 0,
	}
}

function shareDistance({ a, b }: ShareDistanceParams): number {
	let sum = 0
	for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
	return sum / 2
}

function hydeCompare({ year, hyde, model }: HydeCompareParams): HydeComparison {
	const hydeDistribution = densityDistribution({ cells: hyde })
	const modelWeight = model.reduce(
		(sum, cell) => sum + (cell.areaKm2 > 0 ? cell.population : 0),
		0,
	)
	const factor =
		modelWeight > 0 ? hydeDistribution.totalPopulation / modelWeight : 0
	const modelScaled = densityDistribution({
		cells: model.map((cell) => ({
			...cell,
			population: cell.population * factor,
		})),
	})
	return {
		year,
		bins: DENSITY_LABELS,
		hyde: hydeDistribution,
		model: modelScaled,
		populationShareDistance: shareDistance({
			a: hydeDistribution.populationShareByBin,
			b: modelScaled.populationShareByBin,
		}),
		areaShareDistance: shareDistance({
			a: hydeDistribution.areaShareByBin,
			b: modelScaled.areaShareByBin,
		}),
	}
}

const EARTH_CHECK_LEVELS = [3, 7.3]

function techLevelCheck({ settledScore }: TechLevelCheckParams) {
	return {
		settledScore,
		totals: EARTH_CHECK_LEVELS.map((techLevel) => ({
			techLevel,
			population: TECH_LEVEL.worldPopulation({ techLevel }) * settledScore,
		})),
	}
}

// Calibration-only pairing of Earth years with the population-weighted world
// tech level; see docs/terrestrial/population/tech-levels.md.
const EARTH_TECH_LEVEL = {
	domain: [-10000, -3000, -1000, 1, 1000, 1500, 1800, 1900, 1950, 2000, 2025],
	range: [0, 0.5, 1, 1.8, 2.4, 3, 3.8, 5, 6, 7.3, 7.8],
}

function techLevelAt({ year }: TechLevelAtParams): number {
	return MATH.piecewise({ ...EARTH_TECH_LEVEL, x: year })
}

export const FARMING_EARTH = {
	loadHyde,
	hydeCompare,
	assetDigests,
	worktreePinhasi,
	worktreeWayOfLife,
	loadReference,
	provincePoints,
	centres,
	pinhasi,
	regionMembers,
	wayOfLife,
	techLevelCheck,
	techLevelAt,
}
