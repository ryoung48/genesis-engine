import { describe, expect, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { RAIN } from "@/model/climate/precipitation/rain"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

function dist(arr: Uint8Array, labels: readonly string[], isLand: Uint8Array) {
	const counts = new Array(labels.length).fill(0)
	let total = 0
	for (let r = 0; r < arr.length; r++) {
		if (!isLand[r]) continue
		counts[arr[r]]++
		total++
	}
	return labels.map((label, i) => ({
		label,
		cells: counts[i],
		pct: Number(((counts[i] / total) * 100).toFixed(1)),
	}))
}

describe("vegetation: modeled vs observed Earth", () => {
	it("dumps biome + pasta-zone distributions for modeled and observed climate", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realDtr = loadEarthMonthlyRaster("earth-real-dtr")
		const realElevation = loadEarthElevationRaster()

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				seed: 14963991,
				numPoints: DEFAULT_WORLD_PARAMS.numPoints,
				jitter: DEFAULT_WORLD_PARAMS.jitter,
				grayscale: earth.grayscale,
				imageWidth: earth.width,
				imageHeight: earth.height,
				coastlineMask: coastline.grayscale,
				maskWidth: coastline.width,
				maskHeight: coastline.height,
				lakeMask: lake.grayscale,
				lakeMaskWidth: lake.width,
				lakeMaskHeight: lake.height,
				riverLines,
				realClimateMonthly: realClimate.monthly,
				realClimateWidth: realClimate.width,
				realClimateHeight: realClimate.height,
				realClimateMonths: realClimate.months,
				realClimateScale: realClimate.scale,
				realClimateNoData: realClimate.nodata,
				realPrecipMonthly: realPrecip.monthly,
				realPrecipWidth: realPrecip.width,
				realPrecipHeight: realPrecip.height,
				realPrecipMonths: realPrecip.months,
				realPrecipScale: realPrecip.scale,
				realPrecipNoData: realPrecip.nodata,
				realDtrMonthly: realDtr.monthly,
				realDtrWidth: realDtr.width,
				realDtrHeight: realDtr.height,
				realDtrMonths: realDtr.months,
				realDtrScale: realDtr.scale,
				realDtrNoData: realDtr.nodata,
				realElevationRaster: realElevation.raster,
				realElevationWidth: realElevation.width,
				realElevationHeight: realElevation.height,
				realElevationScale: realElevation.scale,
				realElevationNoData: realElevation.nodata,
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
				seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
				volcanism: 1,
				craters: 0,
				maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
				planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
				obliquity: DEFAULT_WORLD_PARAMS.obliquity,
				eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
				spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
				starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
				orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
				daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
				hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
				substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
				perihelion: DEFAULT_WORLD_PARAMS.perihelion,
				pressure: DEFAULT_WORLD_PARAMS.pressure,
			},
		}) as unknown as {
			isLand: Uint8Array
			vegetation: Uint8Array
			realVegetation?: Uint8Array
			pastaClimate: Uint8Array
			realPastaClimate?: Uint8Array
			pastaDebug: { gdd: Float32Array; gar: Float32Array }
			realPastaDebug?: { gdd: Float32Array; gar: Float32Array }
			mesh?: { r_xyz: Float32Array }
			climate?: {
				temperature_monthly: Float32Array
				real_temperature_monthly?: Float32Array
			}
			rainfall: {
				annual: Float32Array
				real_annual?: Float32Array
				monthly: Float32Array
				real_monthly?: Float32Array
			}
		}

		const {
			isLand,
			vegetation,
			realVegetation,
			pastaClimate,
			realPastaClimate,
		} = world
		expect(realVegetation).toBeDefined()
		expect(realPastaClimate).toBeDefined()

		console.info("MODELED biome distribution")
		console.table(dist(vegetation, VEGETATION.biomeLabels, isLand))
		console.info("OBSERVED biome distribution")
		console.table(dist(realVegetation!, VEGETATION.biomeLabels, isLand))

		// Pasta-zone family rollup (first 1-3 letters), to see where the two diverge
		const famModeled: Record<string, number> = {}
		const famObserved: Record<string, number> = {}
		let land = 0
		for (let r = 0; r < isLand.length; r++) {
			if (!isLand[r]) continue
			land++
			const lm = PASTA.pastaLabels[pastaClimate[r]]
			const lo = PASTA.pastaLabels[realPastaClimate![r]]
			const fm = lm.replace(/p$/, "").slice(0, 3)
			const fo = lo.replace(/p$/, "").slice(0, 3)
			famModeled[fm] = (famModeled[fm] ?? 0) + 1
			famObserved[fo] = (famObserved[fo] ?? 0) + 1
		}
		const fams = Array.from(
			new Set([...Object.keys(famModeled), ...Object.keys(famObserved)]),
		).sort()
		console.info("Pasta zone family: modeled vs observed (% of land)")
		console.table(
			fams.map((f) => ({
				family: f,
				modeledPct: Number((((famModeled[f] ?? 0) / land) * 100).toFixed(1)),
				observedPct: Number((((famObserved[f] ?? 0) / land) * 100).toFixed(1)),
			})),
		)

		// Rainfall dispersion by observed wetness class
		const bins = [
			{ label: "<250", lo: 0, hi: 250 },
			{ label: "250-500", lo: 250, hi: 500 },
			{ label: "500-1000", lo: 500, hi: 1000 },
			{ label: "1000-2000", lo: 1000, hi: 2000 },
			{ label: "2000+", lo: 2000, hi: Infinity },
		].map((b) => ({ ...b, n: 0, mod: 0, obs: 0 }))
		const ra = world.rainfall.annual
		const rr = world.rainfall.real_annual
		if (rr) {
			for (let r = 0; r < isLand.length; r++) {
				if (!isLand[r]) continue
				const o = rr[r]
				if (!Number.isFinite(o)) continue
				const b = bins.find((x) => o >= x.lo && o < x.hi)
				if (!b) continue
				b.n++
				b.mod += ra[r]
				b.obs += o
			}
			console.info("Annual rainfall by observed wetness class")
			console.table(
				bins.map((b) => ({
					class: b.label,
					cells: b.n,
					meanObserved: Number((b.obs / Math.max(1, b.n)).toFixed(0)),
					meanModeled: Number((b.mod / Math.max(1, b.n)).toFixed(0)),
				})),
			)
		}

		// ── Is the amplifier the rain field, or the rain→aridity conversion? ──
		const garModeled = world.pastaDebug.gar
		const garObserved = world.realPastaDebug!.gar
		const gddModeled = world.pastaDebug.gdd
		const gddObserved = world.realPastaDebug!.gdd

		function histogram(
			field: Float32Array,
			edges: number[],
		): { bucket: string; pct: number }[] {
			const counts = new Array(edges.length - 1).fill(0)
			let total = 0
			for (let r = 0; r < isLand.length; r++) {
				if (!isLand[r]) continue
				const v = field[r]
				total++
				for (let i = 0; i < edges.length - 1; i++) {
					if (v >= edges[i] && v < edges[i + 1]) {
						counts[i]++
						break
					}
				}
			}
			return counts.map((c, i) => ({
				bucket: `${edges[i]}-${edges[i + 1]}`,
				pct: Number(((c / total) * 100).toFixed(1)),
			}))
		}

		const garEdges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 0.95, 1.0001]
		console.info(
			"GAr (growing-season aridity) distribution -- woods/grass live at ~0.3-0.8",
		)
		console.table(
			histogram(garModeled, garEdges).map((m, i) => ({
				bucket: m.bucket,
				modeledPct: m.pct,
				observedPct: histogram(garObserved, garEdges)[i].pct,
			})),
		)

		const gddEdges = [0, 50, 350, 600, 1000, 1600, 2400, 4000, 100000]
		console.info("GDD distribution -- <350 => frost/tundra zone")
		console.table(
			histogram(gddModeled, gddEdges).map((m, i) => ({
				bucket: m.bucket,
				modeledPct: m.pct,
				observedPct: histogram(gddObserved, gddEdges)[i].pct,
			})),
		)

		// Rain seasonality: share of annual rain in the 6 consecutive wettest
		// months (0.5 = perfectly aseasonal, 1.0 = all rain in one half-year)
		const rm = world.rainfall.monthly
		const rmReal = world.rainfall.real_monthly
		const N2 = isLand.length
		if (rmReal) {
			const seasonBins = [
				{ label: "<250", lo: 0, hi: 250 },
				{ label: "250-500", lo: 250, hi: 500 },
				{ label: "500-1000", lo: 500, hi: 1000 },
				{ label: "1000-2000", lo: 1000, hi: 2000 },
				{ label: "2000+", lo: 2000, hi: Infinity },
			].map((b) => ({ ...b, n: 0, mod: 0, obs: 0 }))
			function wettestHalfShare(src: Float32Array, r: number): number {
				let annual = 0
				const mo: number[] = []
				for (let m = 0; m < 12; m++) {
					const v = src[m * N2 + r]
					mo.push(v)
					annual += v
				}
				if (annual <= 0) return 0.5
				let best = 0
				for (let s = 0; s < 12; s++) {
					let sum = 0
					for (let k = 0; k < 6; k++) sum += mo[(s + k) % 12]
					if (sum > best) best = sum
				}
				return best / annual
			}
			for (let r = 0; r < N2; r++) {
				if (!isLand[r]) continue
				const o = rr?.[r]
				if (o === undefined || !Number.isFinite(o)) continue
				const b = seasonBins.find((x) => o >= x.lo && o < x.hi)
				if (!b) continue
				b.n++
				b.mod += wettestHalfShare(rm, r)
				b.obs += wettestHalfShare(rmReal, r)
			}
			console.info(
				"Rain seasonality: share of annual rain in wettest 6 months (0.5=aseasonal)",
			)
			console.table(
				seasonBins.map((b) => ({
					class: b.label,
					cells: b.n,
					observedShare: Number((b.obs / Math.max(1, b.n)).toFixed(3)),
					modeledShare: Number((b.mod / Math.max(1, b.n)).toFixed(3)),
				})),
			)

			// Rain PHASE: fraction of annual rain in local warm season
			// (NH May-Sep = months 4-8, SH Nov-Mar = months 10,11,0,1,2).
			// > 0.5 = summer-wet, < 0.5 = winter-wet. Catches phase inversion
			// (e.g. modeled Florida dry-summer/wet-winter) that the wettest-6
			// share above cannot see.
			const r_xyz = world.mesh?.r_xyz
			const latOf = (r: number) => {
				if (!r_xyz) return 0
				const z = Math.max(-1, Math.min(1, r_xyz[r * 3 + 2]))
				return (Math.asin(z) * 180) / Math.PI
			}
			function warmSeasonShare(src: Float32Array, r: number): number {
				const north = latOf(r) >= 0
				const warm = north ? [4, 5, 6, 7, 8] : [10, 11, 0, 1, 2]
				let annual = 0
				let warmSum = 0
				for (let m = 0; m < 12; m++) {
					const v = src[m * N2 + r]
					annual += v
					if (warm.includes(m)) warmSum += v
				}
				return annual > 0 ? warmSum / annual : 5 / 12
			}
			const phaseBands = [
				{ label: "0-15", lo: 0, hi: 15 },
				{ label: "15-25", lo: 15, hi: 25 },
				{ label: "25-35", lo: 25, hi: 35 },
				{ label: "35-45", lo: 35, hi: 45 },
				{ label: "45-60", lo: 45, hi: 60 },
			].map((b) => ({ ...b, n: 0, mod: 0, obs: 0 }))
			for (let r = 0; r < N2; r++) {
				if (!isLand[r]) continue
				const o = rr?.[r]
				if (o === undefined || !Number.isFinite(o) || o < 50) continue
				const absLat = Math.abs(latOf(r))
				const b = phaseBands.find((x) => absLat >= x.lo && absLat < x.hi)
				if (!b) continue
				b.n++
				b.mod += warmSeasonShare(rm, r)
				b.obs += warmSeasonShare(rmReal, r)
			}
			console.info(
				"Rain phase: warm-season share of annual rain (>0.5 summer-wet, <0.5 winter-wet)",
			)
			console.table(
				phaseBands.map((b) => ({
					absLatBand: b.label,
					cells: b.n,
					observedWarmShare: Number((b.obs / Math.max(1, b.n)).toFixed(3)),
					modeledWarmShare: Number((b.mod / Math.max(1, b.n)).toFixed(3)),
				})),
			)
		}

		// ITCZ reach: closest the modeled thermal equator gets to each land
		// cell over the year (deg lat). If this is large in the 20-32° bands,
		// the ITCZ term contributes ~nothing there in any month, so the
		// winter-phased eastStorms term is the only rain source -> phase flips.
		const meshFull = world.mesh as unknown as Parameters<
			typeof RAIN.computeThermalEquator
		>[0]["mesh"]
		const tMonthly = world.climate?.temperature_monthly
		const rxyz = world.mesh?.r_xyz
		if (meshFull && tMonthly && rxyz) {
			const nRegions = isLand.length
			const teqMonths: Float32Array[] = []
			for (let m = 0; m < 12; m++) {
				teqMonths.push(
					RAIN.computeThermalEquator({
						mesh: meshFull,
						temps: tMonthly.subarray(m * nRegions, (m + 1) * nRegions),
					}),
				)
			}
			const nBins = teqMonths[0].length
			const reachBands = [
				{ label: "0-15", lo: 0, hi: 15 },
				{ label: "15-25", lo: 15, hi: 25 },
				{ label: "25-35", lo: 25, hi: 35 },
				{ label: "35-45", lo: 35, hi: 45 },
			].map((b) => ({ ...b, n: 0, minApproach: 0, teqMax: 0 }))
			for (let r = 0; r < isLand.length; r++) {
				if (!isLand[r]) continue
				const x = rxyz[r * 3]
				const y = rxyz[r * 3 + 1]
				const z = Math.max(-1, Math.min(1, rxyz[r * 3 + 2]))
				const lat = (Math.asin(z) * 180) / Math.PI
				const lon = (Math.atan2(y, x) * 180) / Math.PI
				const bin = Math.max(
					0,
					Math.min(nBins - 1, Math.floor(((lon + 180) / 360) * nBins)),
				)
				let closest = Infinity
				let teqPeak = -Infinity
				for (let m = 0; m < 12; m++) {
					const teq = teqMonths[m][bin]
					closest = Math.min(closest, Math.abs(lat - teq))
					if (lat >= 0) teqPeak = Math.max(teqPeak, teq)
					else teqPeak = Math.max(teqPeak, -teq)
				}
				const b = reachBands.find(
					(bb) => Math.abs(lat) >= bb.lo && Math.abs(lat) < bb.hi,
				)
				if (!b) continue
				b.n++
				b.minApproach += closest
				b.teqMax += teqPeak
			}
			console.info(
				"ITCZ reach: mean closest approach of modeled thermal equator (deg lat), + mean poleward-most teq",
			)
			console.table(
				reachBands.map((b) => ({
					absLatBand: b.label,
					cells: b.n,
					meanClosestApproachDeg: Number(
						(b.minApproach / Math.max(1, b.n)).toFixed(1),
					),
					meanPolewardTeqDeg: Number((b.teqMax / Math.max(1, b.n)).toFixed(1)),
				})),
			)

			// Is the thermal equator under-migrating because of the smoothing, or
			// because the modeled temperature field's warm hemisphere isn't hot
			// enough at 20-35°? Compare teq from MODELED vs REAL monthly temps for
			// NH mid-summer (Jul) and mid-winter (Jan), by longitude sector.
			const realT = world.climate?.real_temperature_monthly
			if (realT) {
				const teqReal = (m: number) =>
					RAIN.computeThermalEquator({
						mesh: meshFull,
						temps: realT.subarray(m * nRegions, (m + 1) * nRegions),
					})
				const sectors = [
					{ label: "Africa/Europe 0-40E", lo: 0, hi: 40 },
					{ label: "Asia 60-100E", lo: 60, hi: 100 },
					{ label: "N America 120-80W", lo: -120, hi: -80 },
					{ label: "S America 70-40W", lo: -70, hi: -40 },
				]
				const julMod = teqMonths[6]
				const janMod = teqMonths[0]
				const julReal = teqReal(6)
				const janReal = teqReal(0)
				const binLon = (bin: number) => (bin / nBins) * 360 - 180
				const rows = sectors.map((s) => {
					let jm = 0
					let jr = 0
					let wm = 0
					let wr = 0
					let n = 0
					for (let bin = 0; bin < nBins; bin++) {
						const lon = binLon(bin)
						if (lon < s.lo || lon >= s.hi) continue
						n++
						jm += julMod[bin]
						jr += julReal[bin]
						wm += janMod[bin]
						wr += janReal[bin]
					}
					return {
						sector: s.label,
						julTeqModeled: Number((jm / Math.max(1, n)).toFixed(1)),
						julTeqReal: Number((jr / Math.max(1, n)).toFixed(1)),
						janTeqModeled: Number((wm / Math.max(1, n)).toFixed(1)),
						janTeqReal: Number((wr / Math.max(1, n)).toFixed(1)),
					}
				})
				console.info(
					"Thermal equator: modeled vs real, Jul & Jan, by longitude sector",
				)
				console.table(rows)
			}
		}

		// EBM seasonal amplitude: (warmest month - coldest month) of temperature,
		// modeled vs real, by abs-lat band -- and the modeled vs real mean temp
		// in local mid-summer, to see whether the summer heat max reaches the
		// subtropics at all.
		const tMod = world.climate?.temperature_monthly
		const tReal = world.climate?.real_temperature_monthly
		const rxyz2 = world.mesh?.r_xyz
		if (tMod && tReal && rxyz2) {
			const bands = [
				{ label: "0-10", lo: 0, hi: 10 },
				{ label: "10-20", lo: 10, hi: 20 },
				{ label: "20-30", lo: 20, hi: 30 },
				{ label: "30-40", lo: 30, hi: 40 },
				{ label: "40-55", lo: 40, hi: 55 },
			].map((b) => ({
				...b,
				n: 0,
				ampMod: 0,
				ampReal: 0,
				sumMod: 0,
				sumReal: 0,
			}))
			const N3 = isLand.length
			for (let r = 0; r < N3; r++) {
				if (!isLand[r]) continue
				const z = Math.max(-1, Math.min(1, rxyz2[r * 3 + 2]))
				const lat = (Math.asin(z) * 180) / Math.PI
				const north = lat >= 0
				const b = bands.find(
					(bb) => Math.abs(lat) >= bb.lo && Math.abs(lat) < bb.hi,
				)
				if (!b) continue
				let hiM = -Infinity
				let loM = Infinity
				let hiR = -Infinity
				let loR = Infinity
				for (let m = 0; m < 12; m++) {
					const vm = tMod[m * N3 + r]
					const vr = tReal[m * N3 + r]
					if (!Number.isFinite(vr)) continue
					if (vm > hiM) hiM = vm
					if (vm < loM) loM = vm
					if (vr > hiR) hiR = vr
					if (vr < loR) loR = vr
				}
				if (!Number.isFinite(hiR)) continue
				const summer = north ? 6 : 0
				const sm = tMod[summer * N3 + r]
				const sr = tReal[summer * N3 + r]
				b.n++
				b.ampMod += hiM - loM
				b.ampReal += hiR - loR
				b.sumMod += sm
				b.sumReal += sr
			}
			console.info(
				"EBM seasonal amplitude (warm-cold month, °C) + local-summer mean temp, by abs-lat band",
			)
			console.table(
				bands.map((b) => ({
					absLatBand: b.label,
					cells: b.n,
					ampModeled: Number((b.ampMod / Math.max(1, b.n)).toFixed(1)),
					ampReal: Number((b.ampReal / Math.max(1, b.n)).toFixed(1)),
					summerTModeled: Number((b.sumMod / Math.max(1, b.n)).toFixed(1)),
					summerTReal: Number((b.sumReal / Math.max(1, b.n)).toFixed(1)),
				})),
			)
		}

		expect(land).toBeGreaterThan(0)
	}, 600_000)
})
