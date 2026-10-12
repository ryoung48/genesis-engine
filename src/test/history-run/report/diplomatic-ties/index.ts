import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import type {
	CaptureParams,
	CreateTrackerParams,
	DiplomaticTieCapture,
	DiplomaticTieCounts,
	DiplomaticTiesReport,
	DiplomaticTieTracker,
	LogParams,
	SampleParams,
	TieKind,
	TieRole,
	WindowParams,
} from "@/test/history-run/report/diplomatic-ties/types"

const KINDS: TieKind[] = [
	"alliance",
	"vassal",
	"union",
	"dependency",
	"marriage",
	"war",
	"any",
]
const ROLES: TieRole[] = ["vassals", "overlords", "juniors", "seniors"]

function empty(): DiplomaticTieCounts {
	return {
		realms: 0,
		ties: Object.fromEntries(
			KINDS.map((kind) => [kind, { pairs: 0, realms: 0, realmShare: 0 }]),
		) as DiplomaticTieCounts["ties"],
		roles: Object.fromEntries(
			ROLES.map((role) => [role, { realms: 0, realmShare: 0 }]),
		) as DiplomaticTieCounts["roles"],
	}
}

function capture({ engine }: CaptureParams): DiplomaticTieCapture {
	const active = new Set<number>()
	for (let p = 0; p < engine.P; p++)
		if (
			!engine.desolate[p] &&
			!engine.stateless[p] &&
			STATE.isSovereign({ state: engine, p })
		)
			active.add(p)
	const counts = empty()
	counts.realms = active.size
	const pairs = Object.fromEntries(
		KINDS.map((kind) => [kind, new Set<number>()]),
	) as Record<TieKind, Set<number>>
	const members = Object.fromEntries(
		KINDS.map((kind) => [kind, new Set<number>()]),
	) as Record<TieKind, Set<number>>
	const roles = Object.fromEntries(
		ROLES.map((role) => [role, new Set<number>()]),
	) as Record<TieRole, Set<number>>
	let invalidAlliances = 0
	let mixedGovernmentUnions = 0
	for (const a of active) {
		for (const b of engine.relationColumns[a]) {
			if (b <= a || !active.has(b)) continue
			const forward = STATE.getRelation({ state: engine, a, b })
			const backward = STATE.getRelation({ state: engine, a: b, b: a })
			let kind: TieKind
			if (forward === STATE.rel.COLONY || backward === STATE.rel.COLONY)
				kind = "dependency"
			else if (forward === STATE.rel.ALLY) {
				kind = "alliance"
				if (!STATE.canAlly({ state: engine, a, b })) invalidAlliances++
			} else if (
				forward === STATE.rel.VASSAL ||
				forward === STATE.rel.OVERLORD
			) {
				kind = "vassal"
				roles.vassals.add(forward === STATE.rel.VASSAL ? b : a)
				roles.overlords.add(forward === STATE.rel.VASSAL ? a : b)
			} else if (
				forward === STATE.rel.PU_JUNIOR ||
				forward === STATE.rel.PU_SENIOR
			) {
				kind = "union"
				roles.juniors.add(forward === STATE.rel.PU_JUNIOR ? b : a)
				roles.seniors.add(forward === STATE.rel.PU_JUNIOR ? a : b)
				if (
					[a, b].some(
						(p) =>
							GOVERNMENT.successionOfIndex(engine.governmentType[p]) !==
							"single_heir",
					)
				)
					mixedGovernmentUnions++
			} else if (forward === STATE.rel.WAR) kind = "war"
			else continue
			const key = a * engine.P + b
			for (const group of [kind, "any"] as const) {
				pairs[group].add(key)
				members[group].add(a).add(b)
			}
		}
	}
	for (const { first, second } of engine.marriageTies.values()) {
		if (!active.has(first) || !active.has(second)) continue
		const key = Math.min(first, second) * engine.P + Math.max(first, second)
		for (const kind of ["marriage", "any"] as const) {
			pairs[kind].add(key)
			members[kind].add(first).add(second)
		}
	}
	for (const kind of KINDS)
		counts.ties[kind] = {
			pairs: pairs[kind].size,
			realms: members[kind].size,
			realmShare: members[kind].size / Math.max(1, active.size),
		}
	for (const role of ROLES)
		counts.roles[role] = {
			realms: roles[role].size,
			realmShare: roles[role].size / Math.max(1, active.size),
		}
	return {
		snapshot: { year: engine.time / STATE.yearMs, ...counts },
		invalidAlliances,
		mixedGovernmentUnions,
	}
}

function create({ initial }: CreateTrackerParams): DiplomaticTieTracker {
	return { initial, samples: 0, totals: empty() }
}

function sample({ tracker, snapshot }: SampleParams): void {
	tracker.samples++
	tracker.totals.realms += snapshot.realms
	for (const kind of KINDS) {
		tracker.totals.ties[kind].pairs += snapshot.ties[kind].pairs
		tracker.totals.ties[kind].realms += snapshot.ties[kind].realms
	}
	for (const role of ROLES)
		tracker.totals.roles[role].realms += snapshot.roles[role].realms
}

function window({ tracker, end }: WindowParams): DiplomaticTiesReport {
	const samples = Math.max(1, tracker.samples)
	const denominator = Math.max(1, tracker.totals.realms)
	const mean = empty()
	mean.realms = tracker.totals.realms / samples
	for (const kind of KINDS) {
		const total = tracker.totals.ties[kind]
		mean.ties[kind] = {
			pairs: total.pairs / samples,
			realms: total.realms / samples,
			realmShare: total.realms / denominator,
		}
	}
	for (const role of ROLES) {
		const total = tracker.totals.roles[role].realms
		mean.roles[role] = {
			realms: total / samples,
			realmShare: total / denominator,
		}
	}
	const report = {
		initial: tracker.initial,
		end,
		samples: tracker.samples,
		mean,
	}
	tracker.initial = end
	tracker.samples = 0
	tracker.totals = empty()
	return report
}

function log({ reports, log: write }: LogParams): void {
	write(
		"diplomatic ties: distinct pairs; distinct realms / all landowning realms; mean sampled every 10 years",
	)
	write(
		"period      snapshot  realms  tie         pairs  tied realms  realm share",
	)
	for (const { from, to, diplomaticTies } of reports) {
		for (const time of ["initial", "end", "mean"] as const) {
			const snapshot = diplomaticTies[time]
			for (const kind of KINDS) {
				const tie = snapshot.ties[kind]
				write(
					`${`${from}-${to}`.padEnd(11)} ${time.padEnd(8)} ${snapshot.realms.toFixed(1).padStart(6)} ${kind.padEnd(10)} ${tie.pairs.toFixed(1).padStart(6)} ${tie.realms.toFixed(1).padStart(12)} ${(100 * tie.realmShare).toFixed(1).padStart(11)}%`,
				)
			}
			for (const role of ROLES) {
				const coverage = snapshot.roles[role]
				write(
					`${`${from}-${to}`.padEnd(11)} ${time.padEnd(8)} ${snapshot.realms.toFixed(1).padStart(6)} ${role.padEnd(10)} ${"—".padStart(6)} ${coverage.realms.toFixed(1).padStart(12)} ${(100 * coverage.realmShare).toFixed(1).padStart(11)}%`,
				)
			}
		}
	}
}

export const DIPLOMATIC_TIES_REPORT = { capture, create, sample, window, log }
