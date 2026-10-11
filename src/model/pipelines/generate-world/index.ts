import { COARSE_PLATES } from "@/model/geography/tectonics/coarse-plates"
import { COLLISION } from "@/model/geography/tectonics/collision"
import { MANTLE } from "@/model/geography/tectonics/mantle"
import { PLATES } from "@/model/geography/tectonics/plates"
import { SUPER_PLATES } from "@/model/geography/tectonics/super-plates"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
} from "@/model/geography/tectonics/types"
import { CRATERS } from "@/model/geography/terrain/craters"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import { EROSION } from "@/model/geography/terrain/erosion"
import { HOTSPOTS } from "@/model/geography/terrain/hotspots"
import { SEA_LEVEL } from "@/model/geography/terrain/sea-level"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MESH } from "@/model/mesh"
import { DERIVE_PROVINCE_SOCIETY } from "@/model/pipelines/derive-province-society"
import type {
	ApplyPeakCompressionParams,
	GenerateGenesisWorldParams,
	RunActivePathParams,
	SummarizeHotspotExposureParams,
	TectonicPathResult,
} from "@/model/pipelines/generate-world/types"
import { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import type { GenesisWorld } from "@/model/pipelines/types"
import { STATS } from "@/model/shared/math/stats"
import { PARALLEL } from "@/model/shared/parallel"
import { RNG } from "@/model/shared/random/rng"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import { UNITS } from "@/model/shared/units"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { URBANIZATION } from "@/model/society/urbanization"

function applyPeakCompression({ elev, N }: ApplyPeakCompressionParams): void {
	for (let r = 0; r < N; r++) {
		if (elev[r] > 0) elev[r] = Math.pow(elev[r], 0.92)
	}
}

function clampHotspots(raw: Float32Array): Float32Array {
	for (let i = 0; i < raw.length; i++) {
		const value = raw[i]
		raw[i] = value <= 0 ? 0 : value >= 1 ? 1 : value
	}
	return raw
}

const HOTSPOT_EXPOSURE_THRESHOLD = 0.01

function summarizeHotspotExposure({
	hotspot,
	beforeFloodLand,
	finalLand,
}: SummarizeHotspotExposureParams) {
	let activeCells = 0
	let aboveWaterBeforeFlood = 0
	let aboveWaterAfterFlood = 0
	for (let r = 0; r < hotspot.length; r++) {
		if (hotspot[r] <= HOTSPOT_EXPOSURE_THRESHOLD) continue
		activeCells++
		if (beforeFloodLand[r]) aboveWaterBeforeFlood++
		if (finalLand[r]) aboveWaterAfterFlood++
	}
	return {
		threshold: HOTSPOT_EXPOSURE_THRESHOLD,
		activeCells,
		aboveWaterBeforeFlood,
		aboveWaterAfterFlood,
	}
}

function runActivePath({
	mesh,
	r_plate,
	plates,
	plateIds,
	coarse,
	params,
	volcanism,
	plateAssignment,
	pipelineTiming,
	elevationTiming,
	onProgress,
}: RunActivePathParams): TectonicPathResult {
	// 5. Plate density (ocean: 3.0–3.5, land: 2.4–2.9)
	const plateDensity = new Map<number, number>()
	const densityRng = RNG.createRng({ seed: params.seed + 777 })
	for (const pid of plateIds) {
		const oceanDensity = 3.0 + densityRng.random() * 0.5
		const landDensity = 2.4 + densityRng.random() * 0.5
		plateDensity.set(
			pid,
			coarse.coarsePlateIsOcean.has(pid) ? oceanDensity : landDensity,
		)
	}

	const coarseMantleField = MANTLE.computeMantleField({
		plateVec: coarse.coarsePlateVec,
		plateSeeds: coarse.coarsePlateSeeds,
		plateIsOcean: coarse.coarsePlateIsOcean,
		r_plate: coarse.coarse_r_plate,
		mesh: coarse.coarseMesh,
		seed: params.seed,
	})
	const r_mantleUpwelling = MANTLE.projectMantleFieldToRegions({
		coarseMantleField,
		coarseMesh: coarse.coarseMesh,
		mesh,
	})

	// 6. Build super plates (skip if < 8 plates)
	let superPlateData = null
	if (params.numPlates >= 8) {
		superPlateData = TIMING.measure({
			stage: "super-plates",
			timings: pipelineTiming,
			fn: () =>
				SUPER_PLATES.buildSuperPlates({
					mesh,
					r_plate,
					plateSeeds: plateIds,
					plateVec: coarse.coarsePlateVec,
					plateIsOcean: coarse.coarsePlateIsOcean,
					plateDensity,
				}),
		})
		onProgress?.("super-plates", 12)
	}

	// 7. Collision + stress (dual-layer with super plates)
	const collisionTiming: StageTiming[] = []
	const boundary = TIMING.measure({
		stage: "collision",
		timings: pipelineTiming,
		fn: () =>
			COLLISION.classifyBoundaries({
				mesh,
				r_plate,
				plateSeeds: plateIds,
				plateVec: coarse.coarsePlateVec,
				plateIsOcean: coarse.coarsePlateIsOcean,
				plateDensity,
				superPlateData,
				seed: params.seed,
				spread: 5,
				timing: collisionTiming,
			}),
	})
	onProgress?.("collision", 14)

	TIMING.attach({
		timings: pipelineTiming,
		stage: "collision",
		children: collisionTiming,
	})

	// 8. Distance fields
	const distFields = TIMING.measure({
		stage: "distance-fields",
		timings: pipelineTiming,
		fn: () =>
			ELEVATION.computeDistanceFields({
				mesh,
				r_plate,
				plateIsOcean: coarse.coarsePlateIsOcean,
				boundary,
				seed: params.seed,
			}),
	})
	onProgress?.("distance-fields", 16)

	// 9. Elevation assignment
	const blendResult = TIMING.measure({
		stage: "elevation",
		timings: pipelineTiming,
		fn: () =>
			ELEVATION.blendElevation({
				mesh,
				r_plate,
				plateVec: coarse.coarsePlateVec,
				plateIsOcean: coarse.coarsePlateIsOcean,
				distFields,
				boundary,
				roughness: params.roughness,
				volcanism,
				seed: params.seed,
				timing: elevationTiming,
			}),
	})
	TIMING.attach({
		timings: pipelineTiming,
		stage: "elevation",
		children: elevationTiming,
	})
	const { elevation, terrainFeatures } = blendResult
	onProgress?.("elevation", 26)

	// 10. Hotspot volcanism
	const r_hotspot = TIMING.measure({
		stage: "hotspots",
		timings: pipelineTiming,
		fn: () =>
			volcanism <= 0
				? new Float32Array(mesh.numRegions)
				: HOTSPOTS.applyHotspots({
						mesh,
						plates,
						plateAssignment,
						elevation,
						mantleUpwelling: r_mantleUpwelling,
						terrainFeatures,
						seed: params.seed,
						volcanism,
					}),
	})
	clampHotspots(r_hotspot)
	onProgress?.("hotspots", 29)

	// 11. Peak compression (Math.pow(elev, 0.92) for positive elevations)
	TIMING.measure({
		stage: "peak-compression",
		timings: pipelineTiming,
		fn: () => {
			applyPeakCompression({ elev: elevation, N: mesh.numRegions })
		},
	})
	onProgress?.("peak-compression", 29)

	return {
		elevation,
		terrainFeatures,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling,
	}
}

function generateGenesisWorld({
	params,
	onProgress,
}: GenerateGenesisWorldParams): GenesisWorld {
	const startedAt = performance.now()
	PARALLEL.warm()
	const rng = RNG.createRng({ seed: params.seed })
	const volcanism = params.volcanism ?? 1
	const pipelineTiming: StageTiming[] = []
	const elevationTiming: StageTiming[] = []
	const postTiming: StageTiming[] = []
	onProgress?.("Building sphere mesh...", 5)

	// 1. Build hi-res sphere mesh
	const mesh = TIMING.measure({
		stage: "mesh",
		timings: pipelineTiming,
		fn: () =>
			MESH.buildSphereMesh({ n: params.numPoints, jitter: params.jitter, rng }),
	})
	onProgress?.("mesh", 3)

	// Mutable state for the active plate tectonics pipeline
	let elevation: Float32Array
	let plateAssignment: Int32Array
	let boundary: BoundaryInfo
	let distFields: DistanceFields
	let r_hotspot: Float32Array
	let r_mantleUpwelling: Float32Array
	let terrainFeatures: GenesisTerrainFeatures | undefined

	// 2. Generate coarse plates on fixed 20K mesh
	onProgress?.("coarse-plates", 5)
	const coarse = TIMING.measure({
		stage: "coarse-plates",
		timings: pipelineTiming,
		fn: () =>
			COARSE_PLATES.generateCoarsePlates({
				seed: params.seed,
				numPlates: params.numPlates,
				landDistribution: params.landDistribution,
				continentSizeVariety: params.continentSizeVariety,
				landCoverage: params.landCoverage,
			}),
	})

	// 3. Project coarse plates → hi-res mesh with FBM noise perturbation
	onProgress?.("project", 11)
	const r_plate = TIMING.measure({
		stage: "project",
		timings: pipelineTiming,
		fn: () =>
			COARSE_PLATES.projectCoarsePlates({
				mesh,
				coarseMesh: coarse.coarseMesh,
				coarse_r_plate: coarse.coarse_r_plate,
				seed: params.seed,
				numPlates: params.numPlates,
			}),
	})

	// 4. Smooth projected boundaries + reconnect fragments
	const plateIds = Array.from(coarse.coarsePlateSeeds)
	onProgress?.("smooth-plates", 12)
	TIMING.measure({
		stage: "smooth-plates",
		timings: pipelineTiming,
		fn: () => {
			PLATES.smoothAndReconnectPlates({
				mesh,
				r_plate,
				plateSeeds: plateIds,
				numPasses: 3,
			})
		},
	})

	// Build TectonicPlate[] and plateAssignment
	const maxSeedId = plateIds.reduce((m, p) => Math.max(m, p), 0)
	const seedToIdx = new Int32Array(maxSeedId + 1).fill(-1)
	plateIds.forEach((pid, idx) => {
		seedToIdx[pid] = idx
	})

	const plates = plateIds.map((pid, idx) => {
		const pv = coarse.coarsePlateVec.get(pid)!
		return {
			id: idx,
			isOcean: coarse.coarsePlateIsOcean.has(pid),
			pole: pv.pole,
			omega: pv.omega,
			regions: new Set<number>(),
			growthRate: 1,
			growthDir: [0, 0, 0] as [number, number, number],
			dirStrength: 0,
		}
	})
	plateAssignment = new Int32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const idx = seedToIdx[r_plate[r]]
		plateAssignment[r] = idx !== -1 ? idx : 0
	}
	// 5–11. Active plate tectonics pipeline
	;({
		elevation,
		terrainFeatures,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling,
	} = runActivePath({
		mesh,
		r_plate,
		plates,
		plateIds,
		coarse,
		params,
		volcanism,
		plateAssignment,
		pipelineTiming,
		elevationTiming,
		onProgress,
	}))

	// 12. Terrain post-processing (genesis order)
	TIMING.measure({
		stage: "post",
		timings: pipelineTiming,
		fn: () => {
			// Terrain warp — first, before ocean detection or smoothing
			if (params.terrainWarp > 0) {
				const postStageStart = performance.now()
				EROSION.warpTerrain({
					mesh,
					elev: elevation,
					seed: params.seed,
					strength: params.terrainWarp,
					r_hotspot,
				})
				TIMING.record({
					stage: `Terrain warp (strength=${params.terrainWarp.toFixed(2)})`,
					timings: postTiming,
					startedAt: postStageStart,
				})
			}

			// Build ocean mask from current elevation (after warp)
			const ocean = new Uint8Array(mesh.numRegions)
			for (let r = 0; r < mesh.numRegions; r++) {
				if (elevation[r] <= 0) ocean[r] = 1
			}

			// Bilateral smoothing
			if (params.smoothing > 0) {
				const smoothIters = Math.round(1 + params.smoothing * 4)
				const smoothStr = 0.2 + params.smoothing * 0.5
				const postStageStart = performance.now()
				EROSION.smoothElevation({
					mesh,
					elev: elevation,
					r_isOcean: ocean,
					iterations: smoothIters,
					strength: smoothStr,
				})
				TIMING.record({
					stage: `Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`,
					timings: postTiming,
					startedAt: postStageStart,
				})
			}

			// Composite erosion (hydraulic + thermal + glacial interleaved)
			const gIters = Math.round(params.glacialErosion * 10)
			if (
				params.hydraulicErosion > 0 ||
				params.thermalErosion > 0 ||
				gIters > 0
			) {
				const hIters = Math.round(params.hydraulicErosion * 20)
				const hK = params.hydraulicErosion * 0.0006
				const tIters = Math.round(params.thermalErosion * 10)
				const talusSlope = 1.2 - params.thermalErosion * 0.4
				const kThermal = params.thermalErosion * 0.15
				const postStageStart = performance.now()
				EROSION.erodeComposite({
					mesh,
					elev: elevation,
					r_isOcean: ocean,
					hIters,
					K: hK,
					m: 0.5,
					dt: 1.0,
					tIters,
					talusSlope,
					kThermal,
					gIters,
					glacialStrength: params.glacialErosion,
				})
				TIMING.record({
					stage: `Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`,
					timings: postTiming,
					startedAt: postStageStart,
				})
			}

			// Ridge sharpening
			if (params.ridgeSharpening > 0) {
				const rsIters = Math.round(1 + params.ridgeSharpening * 3)
				const rsStr = params.ridgeSharpening * 0.08
				const postStageStart = performance.now()
				EROSION.sharpenRidges({
					mesh,
					elev: elevation,
					r_isOcean: ocean,
					iterations: rsIters,
					strength: rsStr,
				})
				TIMING.record({
					stage: `Ridge sharpening (${rsIters} iters)`,
					timings: postTiming,
					startedAt: postStageStart,
				})
			}

			// Always-on soil creep
			const postStageStart = performance.now()
			EROSION.applySoilCreep({
				mesh,
				elev: elevation,
				r_isOcean: ocean,
				iterations: 3,
				strength: 0.1125,
			})
			TIMING.record({
				stage: "Soil creep (3 iters)",
				timings: postTiming,
				startedAt: postStageStart,
			})

			// Honor exact coverage extremes after all terrain shaping.
			if (params.landCoverage <= 0 && volcanism <= 0) {
				for (let r = 0; r < mesh.numRegions; r++) {
					elevation[r] = Math.min(elevation[r], -0.02)
				}
			} else if (params.landCoverage >= 1) {
				for (let r = 0; r < mesh.numRegions; r++) {
					elevation[r] = Math.max(elevation[r], 0.02)
				}
			}
		},
	})

	// Pre-crater land mask — captures tectonic land/ocean boundary before impacts
	const preCraterLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) preCraterLand[r] = 1
	}

	// Impact craters (applied after all erosion so they stay crisp)
	if (params.craters && params.craters > 0) {
		TIMING.measure({
			stage: "craters",
			timings: pipelineTiming,
			fn: () => {
				CRATERS.applyCraters({
					mesh,
					elevation,
					seed: params.seed,
					intensity: params.craters,
					planetRadiusKm: params.planetRadiusKm,
				})
			},
		})
		onProgress?.("craters", 39)
	}

	const maxElevKm = (params.maxElevation ?? 6000) / 1000
	const maxDepthKm = UNITS.getMaxOceanDepthKm(params.planetRadiusKm)
	const baseElevation = elevation.slice()
	const { elevation: finalElevation, elevation_km } =
		SEA_LEVEL.applySeaLevelToElevation({
			baseElevation,
			maxElevKm,
			maxDepthKm,
			seaLevel: params.seaLevel,
		})
	elevation.set(finalElevation)
	const emergedLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (baseElevation[r] <= 0 && elevation_km[r] > 0) emergedLand[r] = 1
	}

	// Final land mask — ocean flood-fill determines which below-sea-level cells
	// are connected to the ocean (become ocean) vs enclosed inland basins (stay land).
	const isLand = new Uint8Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		// BFS from all pre-crater ocean cells through any cell with elevation <= 0
		const flooded = new Uint8Array(mesh.numRegions)
		const queue: number[] = []
		for (let r = 0; r < mesh.numRegions; r++) {
			// Seed only from cells that are ocean *after* sea-level adjustment.
			// preCraterLand captures the pre-adjustment boundary; if sea level
			// dropped, some former ocean cells are now above sea level and must
			// not be seeded as flooded (they should become land).
			if (!preCraterLand[r] && elevation[r] <= 0) {
				flooded[r] = 1
				queue.push(r)
			}
		}
		let head = 0
		while (head < queue.length) {
			const r = queue[head++]
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!flooded[nb] && elevation[nb] <= 0) {
					flooded[nb] = 1
					queue.push(nb)
				}
			}
		}
		// Land = above sea level OR below sea level but not reached by ocean flood
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!flooded[r]) isLand[r] = 1
		}
	}
	const finalCoastDist = TIMING.measure({
		stage: "coastDist",
		timings: pipelineTiming,
		fn: () =>
			STATS.computeCoastDistances({
				mesh,
				isLand,
				planetRadiusKm: params.planetRadiusKm,
			}),
	})
	distFields.distCoast = finalCoastDist.distCoast
	distFields.distCoastLand = finalCoastDist.distCoastLand
	onProgress?.("coastDist", 39)

	// 13. Ocean distance (BFS hop count → km)
	const oceanDist = TIMING.measure({
		stage: "oceanDist",
		timings: pipelineTiming,
		fn: () =>
			STATS.computeOceanDistanceBFS({
				mesh,
				isLand,
				planetRadiusKm: params.planetRadiusKm,
			}),
	})
	onProgress?.("oceanDist", 39)
	// 17. Small ocean detection — patches < 0.1% of land become lakes so rivers drain through them
	const smallOcean = new Uint8Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		let landCount = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (isLand[r]) landCount++
		}
		const minOceanSize = Math.max(1, Math.floor(landCount * 0.001))

		const oceanLabel = new Int32Array(mesh.numRegions).fill(-1)
		let nextLabel = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (isLand[r] || oceanLabel[r] >= 0) continue
			const label = nextLabel++
			const oStack = [r]
			oceanLabel[r] = label
			while (oStack.length > 0) {
				const c = oStack.pop()!
				for (let j = adjOffset[c], jEnd = adjOffset[c + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (!isLand[nb] && oceanLabel[nb] < 0) {
						oceanLabel[nb] = label
						oStack.push(nb)
					}
				}
			}
		}

		const oceanSize = new Int32Array(nextLabel)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (oceanLabel[r] >= 0) oceanSize[oceanLabel[r]]++
		}

		for (let r = 0; r < mesh.numRegions; r++) {
			if (oceanLabel[r] >= 0 && oceanSize[oceanLabel[r]] < minOceanSize) {
				smallOcean[r] = 1
			}
		}
	}

	// River land mask: isLand + small ocean patches (so rivers drain through them)
	const riverLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		riverLand[r] = isLand[r] || smallOcean[r] ? 1 : 0
	}

	// 14–22. Shared post-elevation pipeline (climate → population)
	TIMING.attach({
		timings: pipelineTiming,
		stage: "post",
		children: postTiming,
	})
	const terrainMs = performance.now() - startedAt
	const terrainTiming = pipelineTiming.splice(0)
	const post = TIMING.measure({
		stage: "post-pipeline",
		timings: pipelineTiming,
		fn: () =>
			POST_ELEVATION.runPostElevationPipeline({
				mesh,
				elevation,
				elevation_km,
				isLand,
				riverLand,
				distCoast: distFields.distCoast,
				oceanDist,
				params,
				emergedLand,
				tectonicMode: "active" as const,
				boundary,
				distFields,
				r_hotspot,
				r_mantleUpwelling,
				terrainFeatures,
				onProgress,
			}),
	})
	TIMING.attach({
		timings: pipelineTiming,
		stage: "post-pipeline",
		children: post.timings,
	})
	onProgress?.("post-pipeline", 70)

	// Summarise hotspot exposure using the final isLand (after post-elevation
	// lake clearing) so the stored count stays consistent with world.isLand.
	const hotspotExposure = summarizeHotspotExposure({
		hotspot: r_hotspot,
		beforeFloodLand: preCraterLand,
		finalLand: isLand,
	})

	const societyStart = performance.now()
	const provinceSociety = DERIVE_PROVINCE_SOCIETY.deriveProvinceSociety({
		isEarthImport: false,
		mesh,
		params,
		post,
		isLand,
	})
	const societyMs = performance.now() - societyStart
	onProgress?.("cultures", 77)

	// Urbanization, development and the route/road network used to be produced
	// by the procedural history sim's init passes. They are one-shot functions
	// of geography, hierarchy and settlement size, so they run here instead.
	const infrastructureStart = performance.now()
	const infrastructureTiming: StageTiming[] = []
	const { provinces, population } = post
	const { nations, landmarks } = provinceSociety
	const urbanization = TIMING.measure({
		stage: "urbanization",
		timings: infrastructureTiming,
		fn: () =>
			provinces && nations && population
				? URBANIZATION.computeUrbanization({
						params,
						provinces,
						nations,
						population,
						knowledge: KNOWLEDGE.urbanKnowledge({
							era: params.era,
							baseline: KNOWLEDGE.startBaseline({
								era: params.era,
								startYear: undefined,
							}),
						}),
					})
				: {
						urbanPopulation: new Float32Array(provinces?.count ?? 0),
						development: new Float32Array(provinces?.count ?? 0),
					},
	})
	onProgress?.("urbanization", 80)

	const routes =
		provinces && nations && landmarks
			? TIMING.measure({
					stage: "routes",
					timings: infrastructureTiming,
					fn: () =>
						ROUTES.computeRoutes({
							world: {
								mesh,
								params,
								provinces,
								nations,
								landmarks,
								isLand,
							},
							inputs: {
								urbanPopulation: urbanization.urbanPopulation,
								settlementRegions: provinceSociety.settlementRegions,
								settlementWaterLandmarks:
									provinceSociety.settlementWaterLandmarks,
								settlementPortRegions: provinceSociety.settlementPortRegions,
								timings: infrastructureTiming,
							},
						}),
				})
			: null
	const routeDetails = infrastructureTiming.filter((entry) =>
		entry.Stage.startsWith("computeRoutes:"),
	)
	const infrastructureStages = infrastructureTiming.filter(
		(entry) => !entry.Stage.startsWith("computeRoutes:"),
	)
	TIMING.attach({
		timings: infrastructureStages,
		stage: "routes",
		children: routeDetails,
	})
	onProgress?.("routes", 85)

	const timings: StageTiming[] = []
	const parts: StageTiming[] = []
	TIMING.append({
		stage: "Terrain",
		timings: parts,
		ms: terrainMs,
		children: terrainTiming,
	})
	TIMING.append({
		stage: "Environment",
		timings: parts,
		ms: pipelineTiming[0].ms,
		children: post.timings,
	})
	TIMING.append({
		stage: "Society",
		timings: parts,
		ms: societyMs,
		children: provinceSociety.timings,
	})
	TIMING.append({
		stage: "Infrastructure",
		timings: parts,
		ms: performance.now() - infrastructureStart,
		children: infrastructureStages,
	})
	TIMING.append({
		stage: "Generation",
		timings,
		ms: performance.now() - startedAt,
		children: parts,
	})

	return {
		mesh,
		isEarthImport: false,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		terrainFeatures,
		elevation_km,
		params,
		climate: post.climate,
		wind: post.wind,
		oceanDist,
		rainfall: post.rainfall,
		hazards: post.hazards,
		cycloneRisk: post.cycloneRisk,
		tornadoRisk: post.tornadoRisk,
		tidalRange: post.tidalRange,
		volcanism: {
			hotspot: r_hotspot,
			mantleUpwelling: r_mantleUpwelling,
			hotspotExposure,
		},
		climateZones: post.climateZones,
		realClimateZones: post.realClimateZones,
		pastaClimate: post.pastaClimate,
		pastaDebug: post.pastaDebug,
		iceThickness: post.iceThickness,
		iceMinMonthly: post.iceMinMonthly,
		iceMaxMonthly: post.iceMaxMonthly,
		koppenClimate: post.koppenClimate,
		vegetation: post.vegetation,
		realVegetation: post.realVegetation,
		topography: post.topography,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		riverAccess: post.riverAccess,
		lakeAccess: post.lakeAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
		hydrology: post.hydrology,
		rivers: post.rivers,
		isLand,
		riverLand,
		provinces: post.provinces,
		locations: post.locations,
		nations: provinceSociety.nations,
		cultures: provinceSociety.cultures,
		heritages: provinceSociety.heritages,
		religions: provinceSociety.religions,
		religionFamilies: provinceSociety.religionFamilies,
		religionTypes: provinceSociety.religionTypes,
		religionGender: provinceSociety.religionGender,
		landmarks: provinceSociety.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		settlementRegions: provinceSociety.settlementRegions,
		settlementWaterLandmarks: provinceSociety.settlementWaterLandmarks,
		settlementPortRegions: provinceSociety.settlementPortRegions,
		routes,
		urbanPopulation: urbanization.urbanPopulation,
		development: urbanization.development,
		oceanCurrents: post.oceanCurrents,
		continentCount: STATS.countContinents({ mesh, isLand }),
		monthlyTEQ: post.monthlyTEQ,
		timings,
	}
}

export const GENERATE_WORLD = {
	generateGenesisWorld,
}
