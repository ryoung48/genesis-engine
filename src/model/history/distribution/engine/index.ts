import { DISTRIBUTION_ATTACKS } from "@/model/history/distribution/attacks"
import { DISTRIBUTION_CRADLES } from "@/model/history/distribution/cradles"
import type {
	AdvanceParams,
	CreateEngineParams,
	DistributionEngine,
	EngineParams,
	EngineSplitParams,
	PlaybackParams,
	StepEngineParams,
} from "@/model/history/distribution/engine/types"
import { DISTRIBUTION_RECORD } from "@/model/history/distribution/record"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import { DISTRIBUTION_SECESSION } from "@/model/history/distribution/secession"
import { DISTRIBUTION_SETTLEMENT } from "@/model/history/distribution/settlement"
import { DISTRIBUTION_STATEHOOD } from "@/model/history/distribution/statehood"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_PROJECTION } from "@/model/history/distribution/targets/projection"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import { DATE } from "@/model/history/earth/date"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { RNG } from "@/model/shared/random/rng"

function create({ world }: CreateEngineParams): DistributionEngine {
	if (
		world.params.historyPipeline !== "distribution" ||
		!world.provinces ||
		world.historyMigration.pipeline !== "distribution"
	)
		throw new Error("Distribution requires generated provinces")
	const provinces = structuredClone(world.provinces)
	const territory = DISTRIBUTION_TERRITORY.initialize({
		provinces,
		r_xyz: world.mesh.r_xyz,
	})
	const habitability =
		world.population?.habitability ?? new Float32Array(provinces.count).fill(1)
	const migration = structuredClone(world.historyMigration.data)
	const habitableCount = territory.capacities.reduce(
		(sum, value) => sum + value,
		0,
	)
	const settlement = DISTRIBUTION_SETTLEMENT.seed({
		migration,
		componentCount: territory.capacities.length,
	})
	DISTRIBUTION_SETTLEMENT.step({
		settlement,
		territory,
		year: DISTRIBUTION_TARGETS.startYear,
	})
	const history = PROCEDURAL_RECORD.buildProceduralState({
		world,
		pipeline: "distribution",
		startTimeMs: DATE.eu4DateToTimeMs(`${DISTRIBUTION_TARGETS.startYear}.1.1`),
	})
	for (let p = 0; p < provinces.count; p++) {
		const base = history.record.events.provinceEvents.get(p)?.base
		if (base) {
			base.ownerId = territory.owner[p]
			base.controllerId = territory.owner[p]
		}
	}
	const validation = DISTRIBUTION_TERRITORY.validate({ territory })
	if (validation.ownership || validation.connectivity || validation.capitals)
		throw new Error("Invalid distribution initial ownership")
	const siteScore = Float32Array.from(
		{ length: provinces.count },
		(_, province) =>
			PLACEMENT.nationPlacementScore({
				province,
				habitability,
				waterAccess: provinces.waterAccess,
				provinceContinent: undefined,
				target: 1,
			}),
	)
	const provincePositions = Float32Array.from(territory.positions)
	const cradles = DISTRIBUTION_CRADLES.create({
		provinces,
		migration,
		siteScore,
		r_xyz: provincePositions,
		planetRadiusKm: world.params.planetRadiusKm,
	})
	return {
		territory,
		migration,
		cradles,
		provincePositions,
		planetRadiusKm: world.params.planetRadiusKm,
		habitableCount,
		executionStepCount: 0,
		endpointClampExtraSteps: 0,
		preStatePoliticalSteps: 0,
		preStateAdvanceMs: 0,
		politicalAdvanceMs: 0,
		settlementEvents: 0,
		unmetDemand: 0,
		foundingViolations: 0,
		attacks: DISTRIBUTION_ATTACKS.create(),
		rng: RNG.createRng({ seed: world.params.seed }),
		year: DISTRIBUTION_TARGETS.startYear,
		target: DISTRIBUTION_TARGETS.project({
			capacities: DISTRIBUTION_TARGETS.heldCapacities({
				capacities: settlement.capacities,
				habitableCount,
				year: DISTRIBUTION_TARGETS.startYear,
			}),
			year: DISTRIBUTION_TARGETS.startYear,
		}),
		history,
		settlement,
		siteScore,
		foundings: { projected: 0, firstInComponent: 0, inStatedComponent: 0 },
		sequence: 0,
		pending: [],
		advanceMs: 0,
		projectionMs: 0,
		recordWritingMs: 0,
		recordIngestionMs: 0,
		rebellions: [],
		splits: 0,
		absorptions: 0,
	}
}

function splitCountry({
	engine: e,
	countryId,
	mandatory,
	observed: before,
}: EngineSplitParams): boolean {
	const c = e.territory.countries.get(countryId)
	if (!c || c.members.size < 2) return false
	const limit = DISTRIBUTION_ATTACKS.ceiling({
		territory: e.territory,
		countryId,
		target: e.target,
	})
	let bestSize = 0,
		bestGain = -Infinity
	const total = c.members.size
	for (const size of DISTRIBUTION_SECESSION.sizes({
		total,
		limit: mandatory ? limit : total - 1,
	})) {
		const gain = DISTRIBUTION_PROJECTION.gain({
			before,
			after: DISTRIBUTION_PROJECTION.action({
				observed: before,
				remove: [total],
				add: [total - size, size],
			}),
			target: e.target,
		})
		if (gain > bestGain || (gain === bestGain && size > bestSize)) {
			bestGain = gain
			bestSize = size
		}
	}
	if (
		bestSize === 0 ||
		(!mandatory &&
			(bestGain <= 0 ||
				e.rng.random() >= Math.min(0.08, 0.01 * Math.exp(2 * bestGain))))
	)
		return false
	const detached = DISTRIBUTION_SECESSION.carve({
		territory: e.territory,
		country: c,
		seed: DISTRIBUTION_SECESSION.seed({
			territory: e.territory,
			country: c,
			rng: e.rng,
		}),
		size: bestSize,
		limit: mandatory ? limit : total - 1,
	})
	const after = DISTRIBUTION_PROJECTION.action({
		observed: before,
		remove: [total],
		add: [total - detached.length, detached.length],
	})
	for (const attack of [...e.attacks.active.values()])
		if (attack.attacker === c.id || attack.defender === c.id)
			DISTRIBUTION_ATTACKS.end({
				attacks: e.attacks,
				territory: e.territory,
				attack,
				year: e.year,
				reason: "fragmentation",
			})
	const successor = DISTRIBUTION_TERRITORY.split({
		territory: e.territory,
		country: c,
		provinces: detached,
	})
	e.rebellions.push({
		id: e.attacks.nextId++,
		parent: c.id,
		successor: successor.id,
		province: successor.capital,
	})
	c.cooldown = e.year + 10
	successor.cooldown = e.year + 10
	Object.assign(before, after)
	e.splits++
	return true
}

function step({ engine: e, endpoint }: StepEngineParams): void {
	if (e.year >= 2025) return
	const started = performance.now(),
		previousTimeMs = DATE.eu4DateToTimeMs(`${e.year}.1.1`)
	const scheduled = DISTRIBUTION_TARGETS.nextYear({ year: e.year })
	if (endpoint < scheduled) e.endpointClampExtraSteps++
	e.year = Math.min(scheduled, endpoint)
	e.executionStepCount++
	DISTRIBUTION_SETTLEMENT.step({
		settlement: e.settlement,
		territory: e.territory,
		year: e.year,
	})
	DISTRIBUTION_CRADLES.activate({
		cradles: e.cradles,
		provinces: e.territory.provinces,
		r_xyz: e.provincePositions,
		planetRadiusKm: e.planetRadiusKm,
		year: e.year,
	})
	if (e.year <= DISTRIBUTION_TARGETS.firstStateYear) {
		e.pending.push(
			DISTRIBUTION_RECORD.writeSettlement({ engine: e, previousTimeMs }),
		)
		const elapsed = performance.now() - started
		e.advanceMs += elapsed
		e.preStateAdvanceMs += elapsed
		return
	}
	const oldOwner = e.territory.owner.slice(),
		oldIds = new Set(e.territory.countries.keys())
	const planning = performance.now()
	e.target = DISTRIBUTION_TARGETS.project({
		capacities: DISTRIBUTION_TARGETS.heldCapacities({
			capacities: e.settlement.capacities,
			habitableCount: e.habitableCount,
			year: e.year,
		}),
		year: e.year,
	})
	e.projectionMs += performance.now() - planning
	e.rebellions = []
	e.attacks.declared = []
	e.attacks.ended = []
	e.attacks.gains = []
	e.attacks.biases = []
	e.attacks.attackerRatios = []
	e.attacks.opportunities = 0
	e.attacks.suppressed = 0
	e.attacks.resolved = 0
	e.attacks.captureDraws = 0
	e.attacks.completionRatios = []
	e.attacks.rejectedCapacity = 0
	e.attacks.rejectedFronts = 0
	e.attacks.endReasons = {
		absorbed: 0,
		separated: 0,
		timeout: 0,
		blocked: 0,
		ceiling: 0,
		fragmentation: 0,
	}
	if (e.year > DISTRIBUTION_TARGETS.firstStateYear) {
		DISTRIBUTION_STATEHOOD.found({ engine: e })
		DISTRIBUTION_STATEHOOD.absorb({ engine: e })
	}
	let observed = DISTRIBUTION_PROJECTION.histogram({
		sizes: [...e.territory.countries.values()].map((c) => c.members.size),
	})
	for (const c of [...e.territory.countries.values()])
		while (
			c.members.size >
			DISTRIBUTION_ATTACKS.ceiling({
				territory: e.territory,
				countryId: c.id,
				target: e.target,
			})
		)
			if (
				!splitCountry({ engine: e, countryId: c.id, mandatory: true, observed })
			)
				throw new Error("Cannot enforce country ceiling")
	const params = {
		attacks: e.attacks,
		territory: e.territory,
		target: e.target,
		year: e.year,
		rng: e.rng,
	}
	DISTRIBUTION_ATTACKS.resolve(params)
	observed = DISTRIBUTION_PROJECTION.histogram({
		sizes: [...e.territory.countries.values()].map((c) => c.members.size),
	})
	const fighting = new Set(
		[...e.attacks.active.values()].flatMap((a) => [a.attacker, a.defender]),
	)
	for (const c of e.rng.shuffle(
		[...e.territory.countries.values()].sort((a, b) => a.id - b.id),
	))
		if (!fighting.has(c.id) && e.year >= c.cooldown)
			splitCountry({ engine: e, countryId: c.id, mandatory: false, observed })
	DISTRIBUTION_ATTACKS.declare(params)
	const batch = DISTRIBUTION_RECORD.writeYear({
		engine: e,
		previousTimeMs,
		oldOwner,
		oldIds,
	})
	e.pending.push(batch)
	const elapsed = performance.now() - started
	e.advanceMs += elapsed
	e.politicalAdvanceMs += elapsed
}
function advance({ engine }: EngineParams): void {
	step({ engine, endpoint: 2025 })
}

function advanceUntil({ engine, year }: AdvanceParams): void {
	if (!Number.isInteger(year) || year < engine.year || year > 2025)
		throw new Error("Invalid distribution endpoint")
	while (engine.year < year) step({ engine, endpoint: year })
}

async function play({
	engine,
	isCurrent,
	isRunning,
	onBatch,
	onPaused,
	yieldYear,
	batchYears,
}: PlaybackParams): Promise<void> {
	if (!Number.isInteger(batchYears) || batchYears < 1 || batchYears > 20)
		throw new Error("Invalid transport batch size")
	let queued: RecordBatch[] = []
	const flush = () => {
		if (isCurrent() && queued.length)
			onBatch(DISTRIBUTION_RECORD.mergeBatches({ batches: queued }))
		queued = []
		engine.pending = []
	}
	while (isCurrent() && isRunning() && engine.year < 2025) {
		advance({ engine })
		queued.push(engine.pending[engine.pending.length - 1])
		await yieldYear()
		if (!isCurrent()) {
			engine.pending = []
			return
		}
		if (
 queued.length >= (engine.year <= DISTRIBUTION_TARGETS.firstStateYear ? 1 : batchYears) || !isRunning() || engine.year === 2025
 )
			flush()
	}
	flush()
	if (isCurrent() && !isRunning()) onPaused(engine.history.record.maxTimeMs)
}

export const DISTRIBUTION_ENGINE = { create, advance, advanceUntil, play }
