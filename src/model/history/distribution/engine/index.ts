import { DISTRIBUTION_ATTACKS } from "@/model/history/distribution/attacks"
import type {
	AdvanceParams,
	CreateEngineParams,
	DistributionEngine,
	EngineParams,
	EngineSplitParams,
	PlaybackParams,
} from "@/model/history/distribution/engine/types"
import { DISTRIBUTION_RECORD } from "@/model/history/distribution/record"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import { PROCEDURAL_RECORD } from "@/model/history/record/procedural"
import { RNG } from "@/model/shared/random/rng"

function create({ world }: CreateEngineParams): DistributionEngine {
	if (
		world.params.historyPipeline !== "distribution" ||
		!world.provinces ||
		!world.nations
	)
		throw new Error("Distribution requires generated flat ownership")
	const territory = DISTRIBUTION_TERRITORY.initialize({
		provinces: structuredClone(world.provinces),
		nations: world.nations,
	})
	const validation = DISTRIBUTION_TERRITORY.validate({ territory })
	if (validation.ownership || validation.connectivity || validation.capitals)
		throw new Error("Invalid distribution initial ownership")
	return {
		territory,
		attacks: DISTRIBUTION_ATTACKS.create(),
		rng: RNG.createRng({ seed: world.params.seed }),
		year: 2,
		target: DISTRIBUTION_TARGETS.project({
			capacities: territory.capacities,
			year: 2,
		}),
		history: PROCEDURAL_RECORD.buildProceduralState({
			world,
			pipeline: "distribution",
			startTimeMs: 0,
		}),
		sequence: 0,
		pending: [],
		advanceMs: 0,
		projectionMs: 0,
		recordWritingMs: 0,
		recordIngestionMs: 0,
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
	let bestRoot = -1,
		bestSize = 0,
		bestGain = -Infinity
	const gains = new Map<number, number>()
	const cuts = DISTRIBUTION_TERRITORY.cuts({
		territory: e.territory,
		country: c,
	})
	for (const root of cuts.roots) {
		const size = cuts.sizes.get(root) ?? 0
		if (mandatory && size > limit) continue
		const retainedSize = c.members.size - size,
			bucket = DISTRIBUTION_TARGETS.bucket({ size }),
			retainedBucket = DISTRIBUTION_TARGETS.bucket({ size: retainedSize }),
			key =
				bucket === retainedBucket ? -bucket - 1 : Math.min(size, retainedSize)
		let gain = gains.get(key)
		if (gain === undefined) {
			const after = DISTRIBUTION_TARGETS.action({
				observed: before,
				remove: [c.members.size],
				add: [c.members.size - size, size],
			})
			gain = DISTRIBUTION_TARGETS.gain({ before, after, target: e.target })
			gains.set(key, gain)
		}
		if (gain > bestGain || (gain === bestGain && size > bestSize)) {
			bestGain = gain
			bestRoot = root
			bestSize = size
		}
	}
	if (
		bestRoot < 0 ||
		(!mandatory &&
			(bestGain <= 0 ||
				e.rng.random() >= Math.min(0.08, 0.01 * Math.exp(2 * bestGain))))
	)
		return false
	const best = DISTRIBUTION_TERRITORY.cutMembers({ cuts, root: bestRoot })
	const after = DISTRIBUTION_TARGETS.action({
		observed: before,
		remove: [c.members.size],
		add: [c.members.size - best.length, best.length],
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
	const oldCapital = c.capital
	const bestSet = new Set(best)
	const capitalSide = [
		oldCapital,
		...[...c.members].filter((p) => p !== oldCapital && !bestSet.has(p)),
	]
	const detachCapitalSide = capitalSide.length < best.length
	if (detachCapitalSide) c.capital = best[0]
	const successor = DISTRIBUTION_TERRITORY.split({
		territory: e.territory,
		country: c,
		provinces: detachCapitalSide ? capitalSide : best,
	})
	c.cooldown = e.year + 10
	successor.cooldown = e.year + 10
	Object.assign(before, after)
	e.splits++
	return true
}

function advanceYear({ engine: e }: EngineParams): void {
	if (e.year >= 2025) return
	const started = performance.now(),
		oldOwner = e.territory.owner.slice(),
		oldIds = new Set(e.territory.countries.keys())
	e.year++
	const planning = performance.now()
	e.target = DISTRIBUTION_TARGETS.project({
		capacities: e.territory.capacities,
		year: e.year,
	})
	e.projectionMs += performance.now() - planning
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
	let observed = DISTRIBUTION_TARGETS.histogram({
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
	observed = DISTRIBUTION_TARGETS.histogram({
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
	const batch = DISTRIBUTION_RECORD.writeYear({ engine: e, oldOwner, oldIds })
	e.pending.push(batch)
	e.advanceMs += performance.now() - started
}

function advanceUntil({ engine, year }: AdvanceParams): void {
	if (!Number.isInteger(year) || year < engine.year || year > 2025)
		throw new Error("Invalid distribution endpoint")
	while (engine.year < year) advanceYear({ engine })
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
		advanceYear({ engine })
		queued.push(engine.pending[engine.pending.length - 1])
		await yieldYear()
		if (!isCurrent()) {
			engine.pending = []
			return
		}
		if (queued.length >= batchYears || !isRunning() || engine.year === 2025)
			flush()
	}
	flush()
	if (isCurrent() && !isRunning()) onPaused(engine.history.record.maxTimeMs)
}

export const DISTRIBUTION_ENGINE = { create, advanceYear, advanceUntil, play }
