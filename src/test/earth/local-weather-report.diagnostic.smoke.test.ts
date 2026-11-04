import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { it } from "vitest"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_BASELINE } from "@/model/climate/weather/local/baseline"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_DECISION } from "@/model/climate/weather/local/decision"
import type { WeatherReportCondition as WeatherCondition } from "@/model/climate/weather/local/description/types"
import type { WeatherContext } from "@/model/climate/weather/local/types"
import { HASH } from "@/model/shared/random/hash"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"
import { WEATHER_DISTRIBUTIONS } from "@/test/earth/weather-distributions"
import { WEATHER_DISTRIBUTION_PRESENTATION } from "@/test/earth/weather-distributions/presentation"
import type { WeatherEventExposure } from "@/test/earth/weather-distributions/types"
import { WORLD_CACHE } from "@/test/history-run/world-cache"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

it(
	"reports ten synthetic years on 64 stratified land sites",
	{ timeout: 1_800_000 },
	() => {
		const started = new Date()
		const stepHours = 7
		const directory = path.join(
			"stats/weather",
			`${started.toISOString().replaceAll(":", "-").replace(".", "-")}-province-local-weather`,
		)
		fs.mkdirSync(directory, { recursive: true })
		const worldKind =
			process.env.WEATHER_WORLD === "earth" ? "earth" : "procedural"
		const world =
			worldKind === "earth"
				? CLIMATE_EARTH.importWorld()
				: WORLD_CACHE.generate({
						params: {
							...DEFAULT_WORLD_PARAMS,
							seed: 14963991,
							numPoints: Number(process.env.WEATHER_POINTS ?? 204000),
							tideLock: null,
						},
					})
		const strata = new Map<string, number[]>()
		for (let r = 0; r < world.mesh.numRegions; r++) {
			if (!world.isLand[r]) continue
			const stratum = `${world.climateZones[r]}:${world.elevation_km[r] >= 1 ? 1 : 0}:${world.oceanDist[r] >= 100 ? 1 : 0}`
			const members = strata.get(stratum) ?? []
			members.push(r)
			strata.set(stratum, members)
		}
		const entries = [...strata.entries()].sort((a, b) =>
			a[0].localeCompare(b[0]),
		)
		for (const entry of entries)
			entry[1].sort(
				(a, b) =>
					HASH.unit({ seed: 14963991, channel: a, salt: 0 }) -
					HASH.unit({ seed: 14963991, channel: b, salt: 0 }),
			)
		const chosen: number[] = []
		for (let cursor = 0; chosen.length < 64; cursor++) {
			let added = 0
			for (const entry of entries)
				if (chosen.length < 64 && cursor < entry[1].length) {
					chosen.push(entry[1][cursor])
					added++
				}
			if (!added) break
		}
		const epoch = WEATHER_CLOCK.resolve({
			params: world.params,
			elapsedYears: 0,
			manual: null,
		})
		const initStart = performance.now()
		const context: WeatherContext = {
			revision: 1,
			seed: 14963991,
			radiusKm: world.params.planetRadiusKm,
			provinces: chosen.map((region, province) => {
				const point = {
					region,
					weight: 1,
					xyz: [
						world.mesh.r_xyz[3 * region],
						world.mesh.r_xyz[3 * region + 1],
						world.mesh.r_xyz[3 * region + 2],
					] as [number, number, number],
				}
				return {
					location: {
						province,
						latitude: (Math.asin(point.xyz[2]) * 180) / Math.PI,
						longitude: (Math.atan2(point.xyz[1], point.xyz[0]) * 180) / Math.PI,
						samples: [point],
						approximateLocation: false,
					},
					baselines: [
						WEATHER_BASELINE.build({
							world,
							location: point,
							yearSeconds: epoch.yearSeconds,
						}),
					],
				}
			}),
		}
		const initializationMs = performance.now() - initStart
		const before = structuredClone(context)
		const coldStart = performance.now()
		const first = LOCAL_WEATHER.sampleProvince({
			context,
			instant: epoch,
			province: 0,
		})
		const coldSnapshotMs = performance.now() - coldStart
		const warmStart = performance.now()
		const second = LOCAL_WEATHER.sampleProvince({
			context,
			instant: epoch,
			province: 0,
		})
		const warmSnapshotMs = performance.now() - warmStart
		const sameTimeReproducible =
			JSON.stringify(first) === JSON.stringify(second)
		const sites = chosen.map((region, province) => ({
			region,
			province,
			areaWeight: world.mesh.regionArea[region],
			particleSource: context.provinces[province].baselines[0].particleSource,
			aridity: context.provinces[province].baselines[0].aridity,
			snowSeason: context.provinces[province].baselines[0].temperature.some(
				(value) => value < 0,
			),
			monthlyRainMm: new Array<number>(12).fill(0),
			monthlyBaselineMm: Array.from(
				context.provinces[province].baselines[0].rain,
			),
			hours: 0,
			wetHours: 0,
			fogHours: 0,
			conditionHours: {} as Record<string, number>,
			genusHours: {} as Record<string, number>,
			liquidMm: 0,
			snowWaterMm: 0,
			iceMm: 0,
			visibilitySum: 0,
			partitionViolations: 0,
			stormCloudMismatches: 0,
			blizzardViolations: 0,
			dustHours: 0,
			maxRateMmH: 0,
			temperatureDepartureSum: 0,
			windUDepartureSum: 0,
			windVDepartureSum: 0,
			windSpeedSum: 0,
			cloudDepartureSum: 0,
			cloudHours: 0,
			spellHours: 0,
			spellHistogram: {} as Record<string, number>,
		}))
		const neighborPairs = context.provinces.map((site, index) => {
			const ranked = context.provinces
				.map((other, otherIndex) => ({
					otherIndex,
					distanceKm:
						Math.acos(
							Math.max(
								-1,
								Math.min(
									1,
									site.location.samples[0].xyz.reduce(
										(sum, value, axis) =>
											sum + value * other.location.samples[0].xyz[axis],
										0,
									),
								),
							),
						) * context.radiusKm,
				}))
				.filter((entry) => entry.otherIndex !== index)
				.sort((a, b) => a.distanceKm - b.distanceKm)
			return {
				first: index,
				second: ranked[0].otherIndex,
				distanceKm: ranked[0].distanceKm,
				agreement: 0,
				count: 0,
			}
		})
		const inspected = LOCAL_WEATHER.inspectProvince({
			context,
			instant: epoch,
			province: 0,
		})
		const inspectionMatchesSampling =
			JSON.stringify(inspected.snapshot) === JSON.stringify(first)
		const distributions = WEATHER_DISTRIBUTIONS.create({
			sites: chosen.map((region, province) => ({
				region,
				climate:
					VEGETATION.climateLabels[world.climateZones[region]] ??
					String(world.climateZones[region]),
				latitude: context.provinces[province].location.latitude,
				longitude: context.provinces[province].location.longitude,
				elevationKm: world.elevation_km[region],
				coastKm: world.oceanDist[region],
			})),
			pairs: neighborPairs,
			stepHours,
			years: 10,
		})
		let distributionAccumulationMs = 0
		const loopStart = performance.now()
		let queries = 0
		const stepSeconds = stepHours * 3600
		const rateEdges = [0.1, 0.5, 1, 2.5, 5, 10, 20, 50]
		const shape = {
			samples: 0,
			rateHistogram: new Array(rateEdges.length + 1).fill(0),
			coverHistogram: new Array(10).fill(0),
			departureSquares: 0,
			gustFactorSum: 0,
			gustSamples: 0,
		}
		for (
			let seconds = stepSeconds / 2;
			seconds < 10 * epoch.yearSeconds;
			seconds += stepSeconds
		) {
			const instant = WEATHER_CLOCK.resolve({
				params: world.params,
				elapsedYears: seconds / epoch.yearSeconds,
				manual: null,
			})
			const dominant: (string | null)[] = []
			const active: Set<WeatherCondition>[] = []
			for (let province = 0; province < sites.length; province++) {
				const inspection = LOCAL_WEATHER.inspectProvince({
					context,
					instant,
					province,
				})
				const snapshot = inspection.snapshot
				const value = snapshot.values
				if (!value) throw new Error(`Unavailable diagnostic site ${province}`)
				const recordStart = performance.now()
				active.push(
					WEATHER_DISTRIBUTIONS.record({
						state: distributions,
						site: province,
						instant,
						values: value,
						traces: inspection.traces.flatMap((sample) => sample.triggers),
					}),
				)
				distributionAccumulationMs += performance.now() - recordStart
				queries++
				dominant.push(value.dominant)
				shape.samples++
				if (value.rainRateMmH > 0) {
					const bin = rateEdges.findIndex((edge) => value.rainRateMmH < edge)
					shape.rateHistogram[bin < 0 ? rateEdges.length : bin]++
				}
				if (value.cloudCover !== null)
					shape.coverHistogram[Math.min(9, Math.floor(value.cloudCover * 10))]++
				shape.departureSquares +=
					(value.temperatureC - value.temperatureNormalC) ** 2
				if (value.windSpeedMs >= 3) {
					shape.gustFactorSum += value.gustMs / value.windSpeedMs
					shape.gustSamples++
				}
				const site = sites[province]
				const baseline = context.provinces[province].baselines[0]
				site.hours += stepHours
				site.liquidMm +=
					value.rainRateMmH * value.precipitation.liquid * stepHours
				site.snowWaterMm +=
					value.rainRateMmH * value.precipitation.snow * stepHours
				site.iceMm += value.rainRateMmH * value.precipitation.ice * stepHours
				site.visibilitySum += value.visibilityM * stepHours
				site.windUDepartureSum +=
					(value.windU -
						WEATHER_BASELINE.monthly({
							values: baseline.windU,
							phase: instant.phase,
						})) *
					stepHours
				site.windVDepartureSum +=
					(value.windV -
						WEATHER_BASELINE.monthly({
							values: baseline.windV,
							phase: instant.phase,
						})) *
					stepHours
				site.windSpeedSum += value.windSpeedMs * stepHours
				if (
					value.rainRateMmH > 0 &&
					Math.abs(
						value.precipitation.liquid +
							value.precipitation.snow +
							value.precipitation.ice -
							1,
					) > 1e-9
				)
					site.partitionViolations++
				if (
					value.conditions.some((c) => c.kind === "thunderstorm") &&
					value.clouds !== null &&
					!value.clouds.some((c) => c.genus === "cumulonimbus")
				)
					site.stormCloudMismatches++
				if (
					value.conditions.some((c) => c.kind === "blizzard") &&
					(value.gustMs < WEATHER_DECISION.limits().blizzardGustMs ||
						value.visibilityM >= WEATHER_DECISION.limits().blizzardVisibilityM)
				)
					site.blizzardViolations++
				for (const cloud of value.clouds ?? [])
					site.genusHours[cloud.genus] =
						(site.genusHours[cloud.genus] ?? 0) + stepHours * cloud.cover

				site.monthlyRainMm[Math.min(11, Math.floor(instant.phase * 12))] +=
					(value.rainRateMmH * stepHours) / 10
				site.maxRateMmH = Math.max(site.maxRateMmH, value.rainRateMmH)
				site.temperatureDepartureSum +=
					(value.temperatureC -
						WEATHER_BASELINE.monthly({
							values: baseline.temperature,
							phase: instant.phase,
						})) *
					stepHours
				if (value.cloudCover !== null && baseline.cloud) {
					site.cloudHours += stepHours
					site.cloudDepartureSum +=
						(value.cloudCover -
							WEATHER_BASELINE.monthly({
								values: baseline.cloud,
								phase: instant.phase,
							})) *
						stepHours
				}
				for (const condition of value.conditions) {
					if (condition.share >= 0.25)
						site.conditionHours[condition.kind] =
							(site.conditionHours[condition.kind] ?? 0) + stepHours
				}
				if (
					value.conditions.some(
						(condition) =>
							condition.kind === "fog" || condition.kind === "ice fog",
					)
				)
					site.fogHours += stepHours
				if (
					value.conditions.some(
						(condition) =>
							condition.kind === "sand storm" ||
							condition.kind === "dust storm",
					)
				)
					site.dustHours += stepHours
				if (value.rainRateMmH >= 0.01) {
					site.wetHours += stepHours
					site.spellHours += stepHours
				} else if (site.spellHours) {
					site.spellHistogram[site.spellHours] =
						(site.spellHistogram[site.spellHours] ?? 0) + 1
					site.spellHours = 0
				}
			}
			const spatialStart = performance.now()
			WEATHER_DISTRIBUTIONS.neighbors({ state: distributions, active })
			distributionAccumulationMs += performance.now() - spatialStart
			for (const pair of neighborPairs) {
				pair.count++
				if (dominant[pair.first] === dominant[pair.second]) pair.agreement++
			}
		}
		const evaluationMs = performance.now() - loopStart
		const distributionReport = WEATHER_DISTRIBUTIONS.finish(distributions)
		const gateAgreementViolations = Object.entries(
			distributionReport.triggerGates.all,
		)
			.filter(
				([kind, counts]) =>
					counts.at(-1)!.funnelPassed !==
					distributionReport.conditions.find(
						(condition) => condition.kind === kind,
					)!.samples,
			)
			.map(([kind]) => kind)
		const exposureMismatches = [
			"climate",
			"season",
			"localTime",
			"climateSeason",
			"year",
		].filter(
			(dimension) =>
				distributionReport.bins
					.filter((bin) => bin.dimension === dimension)
					.reduce((sum, bin) => sum + bin.samples, 0) !== queries,
		)

		const environment = distributionReport.environment
		const environmentGroups = [
			environment.overall,
			...Object.values(environment.byCondition),
			...Object.values(environment.byPhenomenon),
		]
		const environmentAccounting =
			Object.entries(distributionReport.systemPrecipitation).every(
				([kind, value]) =>
					value.drySamples + value.wetSamples ===
					distributionReport.conditions.find(
						(condition) => condition.kind === `system:${kind}`,
					)?.samples,
			) &&
			distributionReport.conditions
				.filter((condition) => condition.kind.startsWith("system:"))
				.reduce((sum, condition) => sum + condition.samples, 0) === queries &&
			environment.overall.samples === queries &&
			environmentGroups.every((group) =>
				[
					group.cloudCategories,
					group.cloudDescriptions,
					group.sky,
					group.wind,
					group.temperature,
					group.departures,
				].every(
					(counts) =>
						Object.values(counts).reduce((a, b) => a + b, 0) === group.samples,
				),
			) &&
			distributionReport.conditions.every(
				(condition) =>
					(environment.byCondition[condition.kind]?.samples ?? 0) ===
					condition.samples,
			)
		const rows = sites.map((site) => ({
			...site,
			wetHourFraction: site.wetHours / site.hours,
			meanVisibilityM: site.visibilitySum / site.hours,
			fogFraction: site.fogHours / site.hours,
			dustFraction: site.dustHours / site.hours,
			temperatureDepartureC: site.temperatureDepartureSum / site.hours,
			windUDepartureMs: site.windUDepartureSum / site.hours,
			windVDepartureMs: site.windVDepartureSum / site.hours,
			meanWindSpeedMs: site.windSpeedSum / site.hours,
			cloudDeparturePercentagePoints: site.cloudHours
				? (site.cloudDepartureSum / site.cloudHours) * 100
				: null,
			monthlyRainBiasMm: site.monthlyRainMm.map(
				(value, month) => value - site.monthlyBaselineMm[month],
			),
			terminalSpellCensoredHours: site.spellHours,
		}))
		const area = rows.reduce((sum, row) => sum + row.areaWeight, 0)
		const weighted = (
			key:
				| "wetHourFraction"
				| "fogFraction"
				| "dustFraction"
				| "temperatureDepartureC"
				| "windUDepartureMs"
				| "windVDepartureMs"
				| "meanWindSpeedMs",
		) => rows.reduce((sum, row) => sum + (row[key] * row.areaWeight) / area, 0)
		const mapStart = performance.now()
		const snapshotBatch = sites.map((site) =>
			LOCAL_WEATHER.sampleProvince({
				context,
				instant: epoch,
				province: site.province,
			}),
		)
		const batchMs = performance.now() - mapStart
		const payloadBytes = Buffer.byteLength(JSON.stringify(snapshotBatch))

		const earlierReports = fs
			.readdirSync("stats/weather", { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => path.join("stats/weather", entry.name, "results.json"))
			.filter(
				(file) =>
					file !== path.join(directory, "results.json") && fs.existsSync(file),
			)
			.sort()
			.reverse()
		const baselinePath = earlierReports[0] ?? null
		const previous = baselinePath
			? JSON.parse(fs.readFileSync(baselinePath, "utf8"))
			: null
		const comparison = previous
			? {
					baseline: baselinePath,
					sameSiteIds:
						JSON.stringify(
							(previous.sites as typeof sites).map((site) => site.region),
						) === JSON.stringify(chosen),
					wetFractionChangePercentagePoints:
						100 *
						(weighted("wetHourFraction") -
							previous.areaWeighted.wetHourFraction),
					temperatureDepartureChangeC:
						weighted("temperatureDepartureC") -
						previous.areaWeighted.temperatureDepartureC,
				}
			: null

		const eligibleShare = (members: WeatherEventExposure[]) => {
			const hours = members.reduce((sum, member) => sum + member.hours, 0)
			return {
				sites: members.length,
				share: hours
					? members.reduce((sum, member) => sum + member.events, 0) / hours
					: null,
			}
		}
		const eligibleRates = {
			blizzardSnowSeasonSites: eligibleShare(
				rows
					.filter((row) => row.snowSeason)
					.map((row) => ({
						hours: row.hours,
						events: row.conditionHours.blizzard ?? 0,
					})),
			),
			sandDustAridBareSites: eligibleShare(
				rows
					.filter((row) => row.particleSource !== null && row.aridity < 0.3)
					.map((row) => ({
						hours: row.hours,
						events:
							(row.conditionHours["sand storm"] ?? 0) +
							(row.conditionHours["dust storm"] ?? 0),
					})),
			),
		}
		const report = {
			model: "original-tree-constrained-v6",
			distributions: distributionReport,
			comparison,
			configuration: {
				world: worldKind,
				seed: 14963991,
				regions: world.mesh.numRegions,
				years: 10,
				stepHours,
				epochYear: 0,
				strata: entries.map((entry) => ({
					key: entry[0],
					population: entry[1].length,
					selected: chosen.filter((r) => entry[1].includes(r)).length,
				})),
				omittedStrata: entries
					.filter((entry) => !chosen.some((r) => entry[1].includes(r)))
					.map((entry) => entry[0]),
				siteCount: chosen.length,
			},
			hardware: {
				platform: os.platform(),
				cpu: os.cpus()[0]?.model,
				memoryBytes: os.totalmem(),
			},
			sites: rows,
			neighborPairs: neighborPairs.map((pair) => ({
				...pair,
				agreementFraction: pair.agreement / pair.count,
			})),
			areaWeighted: {
				wetHourFraction: weighted("wetHourFraction"),
				fogFraction: weighted("fogFraction"),
				dustFraction: weighted("dustFraction"),
				temperatureDepartureC: weighted("temperatureDepartureC"),
				windUDepartureMs: weighted("windUDepartureMs"),
				windVDepartureMs: weighted("windVDepartureMs"),
				meanWindSpeedMs: weighted("meanWindSpeedMs"),
			},
			eligibleRates,
			shape: {
				rateEdgesMmH: rateEdges,
				wetRateHistogram: shape.rateHistogram,
				cloudCoverDecileHistogram: shape.coverHistogram,
				temperatureDepartureSdC: Math.sqrt(
					shape.departureSquares / shape.samples,
				),
				meanGustFactorAbove3Ms: shape.gustFactorSum / shape.gustSamples,
			},
			invariants: {
				sameTimeReproducible,
				inspectionMatchesSampling,
				environmentAccounting,
				gateAgreementViolations,
				exposureMismatches,
				baselineUnchanged: JSON.stringify(context) === JSON.stringify(before),
			},
			execution: {
				initializationMs,
				coldSnapshotMs,
				warmSnapshotMs,
				evaluationMs,
				distributionAccumulationMs,
				inspectionTracingEnabled: true,
				queries,
				batchMs,
				payloadBytes,
				contextJsonBytes: Buffer.byteLength(JSON.stringify(context)),
				processMemory: process.memoryUsage(),
			},
			limitations: [
				"64 stratified land sites are not a globally area-representative ensemble.",
				`${stepHours}-hour sampling (coprime with the 24-hour day, so each site cycles through every local hour) aliases shorter events and intervening gaps; sampled event runs are quantized with left/right censoring recorded.`,
				"Condition breakdowns are unweighted stratified site-time occupancies; none are calibrated global rates.",
				"Inspection tracing and distribution accumulation add work to this diagnostic; normal warm/batch timings remain separate.",
				"Cloud genera, dust supply and surface conditions are proxies; no upper-air diagnosis or persistent ground state.",
				"Node memory includes the full imported world and runtime, not isolated browser worker heap.",
			],
		}
		fs.writeFileSync(
			path.join(directory, "results.json"),
			JSON.stringify(report, null, 2),
		)
		fs.writeFileSync(
			path.join(directory, "comparison.md"),
			`# Province local weather diagnostic

Seed 14963991; ${world.mesh.numRegions} regions; 64 sites; 10 years; ${stepHours}-hour sampling.

Cold snapshot ${coldSnapshotMs.toFixed(2)} ms, warm ${warmSnapshotMs.toFixed(2)} ms, 64-province snapshot batch ${batchMs.toFixed(2)} ms. These compare with provisional 1–30 ms warm-query expectation; the batch is diagnostic and no map view is included in this pass.

Wet-hour rates (mm/h, edges ${rateEdges.join("/")}): ${shape.rateHistogram.join(", ")}. Cloud-cover deciles: ${shape.coverHistogram.join(", ")}. Temperature departure SD ${Math.sqrt(shape.departureSquares / shape.samples).toFixed(2)} °C; mean gust factor (wind ≥3 m/s) ${(shape.gustFactorSum / shape.gustSamples).toFixed(2)}.

Blizzard share over ${eligibleRates.blizzardSnowSeasonSites.sites} snow-season sites: ${(100 * (eligibleRates.blizzardSnowSeasonSites.share ?? 0)).toFixed(3)}%. Sand/dust share over ${eligibleRates.sandDustAridBareSites.sites} arid bare sites: ${(100 * (eligibleRates.sandDustAridBareSites.share ?? 0)).toFixed(2)}%.

Bare-ground sites (source, aridity, dust/sand share): ${
				rows
					.filter((row) => row.particleSource !== null)
					.map(
						(row) =>
							`${row.region} ${row.particleSource} ${row.aridity.toFixed(2)} ${(100 * row.dustFraction).toFixed(2)}%`,
					)
					.join("; ") || "none"
			}.

Area-weighted wet fraction ${weighted("wetHourFraction").toFixed(4)}, temperature departure ${weighted("temperatureDepartureC").toFixed(3)} °C. Monthly rain deviations and cloud-floor biases are reported by site, not acceptance gates. Rain is preserved in ensemble expectation, not in each realization.

Baseline unchanged: ${report.invariants.baselineUnchanged}; reproducible: ${sameTimeReproducible}.

${comparison ? `Earlier diagnostic: ${comparison.baseline}. Same site IDs: ${comparison.sameSiteIds}; wet-fraction change ${comparison.wetFractionChangePercentagePoints.toFixed(4)} percentage points; temperature-departure change ${comparison.temperatureDepartureChangeC.toFixed(4)} °C.` : "No earlier local-weather report exists."} The immutable monthly fields are the behavior baseline. Memory and timings are execution measurements, separate from weather statistics. See results.json for site IDs, strata, spells, extremes, neighbor distance/agreement and sampling limitations.
`,
		)
		fs.writeFileSync(
			path.join(directory, "distributions.md"),
			WEATHER_DISTRIBUTION_PRESENTATION.markdown(distributionReport),
		)
		fs.appendFileSync(
			path.join(directory, "comparison.md"),
			`\nSee distributions.md for occupancy, exposure, sampled runs and trigger gates; results.json also includes climate-season cross-tabs, per-site/year counts and per-condition spatial contingency tables. Trace gates agree with emitted conditions: ${gateAgreementViolations.length === 0}; group exposures reconcile: ${exposureMismatches.length === 0}; inspection matches ordinary sampling: ${inspectionMatchesSampling}. Distribution accumulator cost ${distributionAccumulationMs.toFixed(1)} ms is diagnostic overhead, not normal sampling latency.\n`,
		)
		console.log(`Weather diagnostic: ${directory}`)
		if (
			!sameTimeReproducible ||
			!report.invariants.baselineUnchanged ||
			!inspectionMatchesSampling ||
			!environmentAccounting ||
			gateAgreementViolations.length ||
			exposureMismatches.length
		)
			throw new Error("Weather mutated its baseline or failed reproducibility")
	},
)
