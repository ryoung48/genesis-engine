import type {
	AnnualAttackParams,
	Attack,
	AttackState,
	BiasParams,
	CaptureParams,
	CeilingParams,
	CompletionParams,
	EndAttackParams,
	FrontierParams,
	MergerGainParams,
	OpportunityParams,
	WeightParams,
} from "@/model/history/distribution/attacks/types"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"

const maxAttackYears = 40
const captureFraction = 0.02

function completionRate({
	attackerSize,
	defenderSize,
	attackerFronts,
	defenderFronts,
}: CompletionParams): number {
	const attackStrength = attackerSize / attackerFronts,
		defenseStrength = defenderSize / defenderFronts
	return Math.min(
		1,
		(captureProbability({ attackStrength, defenseStrength }) *
			Math.max(1, Math.floor(captureFraction * attackStrength))) /
			defenderSize,
	)
}
function completionRatio(params: CompletionParams): number {
	return Math.min(1, maxAttackYears * completionRate(params))
}
function frontier({
	territory,
	attacker,
	defender,
	limit,
	firstOnly,
}: FrontierParams): number[] {
	const country = territory.countries.get(defender)
	if (!country) return []
	const valid: number[] = []
	const boundary = firstOnly
		? country.boundary
		: [...country.boundary].sort((a, b) => a - b)
	for (const province of boundary)
		if (
			DISTRIBUTION_TERRITORY.canTransfer({
				territory,
				attacker,
				defender,
				province,
				ceiling: limit,
			})
		) {
			valid.push(province)
			if (firstOnly) break
		}
	return valid
}

function bias({ gain }: BiasParams): number {
	return Math.max(
		0.25,
		Math.min(4, Math.exp(2 * Math.max(-1, Math.min(1, gain)))),
	)
}
function opportunity({
	attackerSize,
	defenderSize,
	gain,
}: OpportunityParams): number {
	return Math.min(1, (attackerSize / defenderSize) ** 4) * bias({ gain })
}
function weight({
	attackerSize,
	defenderSize,
	border,
	gain,
}: WeightParams): number {
	return border * opportunity({ attackerSize, defenderSize, gain })
}
function captureProbability({
	attackStrength,
	defenseStrength,
}: CaptureParams): number {
	return attackStrength ** 2 / (attackStrength ** 2 + defenseStrength ** 2)
}
function ceiling({ territory, countryId, target }: CeilingParams): number {
	const c = territory.countries.get(countryId)
	return c
		? Math.min(
				target.raw.ceiling,
				territory.capacities[territory.componentId[c.capital]],
			)
		: 0
}
function mergerGain({
	observed,
	territory,
	attacker,
	defender,
	target,
}: MergerGainParams): number {
	const a = territory.countries.get(attacker),
		d = territory.countries.get(defender)
	if (!a || !d) return 0
	const after = DISTRIBUTION_TARGETS.action({
		observed,
		remove: [a.members.size, d.members.size],
		add: [a.members.size + d.members.size],
	})
	return DISTRIBUTION_TARGETS.gain({ before: observed, after, target })
}
function end({
	attacks,
	territory,
	attack,
	year,
	reason,
}: EndAttackParams): void {
	if (!attacks.active.delete(attack.id)) return
	attacks.ended.push(attack)
	attacks.endReasons[reason]++
	const country = territory.countries.get(attack.attacker)
	if (country) country.cooldown = year + 5
}
function create(): AttackState {
	return {
		active: new Map(),
		nextId: 0,
		declared: [],
		ended: [],
		biases: [],
		gains: [],
		blocked: 0,
		attackerRatios: [],
		opportunities: 0,
		suppressed: 0,
		resolved: 0,
		captureDraws: 0,
		completionRatios: [],
		rejectedFronts: 0,
		rejectedCapacity: 0,
		endReasons: {
			absorbed: 0,
			separated: 0,
			timeout: 0,
			blocked: 0,
			ceiling: 0,
			fragmentation: 0,
		},
	}
}

function resolve({
	attacks,
	territory: t,
	target,
	year,
	rng,
}: AnnualAttackParams): void {
	for (const attack of [...attacks.active.values()].sort(
		(a, b) => a.id - b.id,
	)) {
		const a = t.countries.get(attack.attacker),
			d = t.countries.get(attack.defender)
		const limit = ceiling({ territory: t, countryId: attack.attacker, target })
		const reason =
			!a || !d
				? "absorbed"
				: !a.contacts.has(d.id)
					? "separated"
					: year - attack.start >= maxAttackYears
						? "timeout"
						: a.members.size >= limit
							? "ceiling"
							: !frontier({
										territory: t,
										attacker: a.id,
										defender: d.id,
										limit,
										firstOnly: true,
									}).length
								? "blocked"
								: null
		if (reason) {
			if (reason === "blocked") attacks.blocked++
			end({ attacks, territory: t, attack, year, reason })
		}
	}
	const fronts = new Map<number, number>(),
		sizes = new Map<number, number>()
	for (const c of t.countries.values()) sizes.set(c.id, c.members.size)
	for (const attack of attacks.active.values())
		for (const id of [attack.attacker, attack.defender])
			fronts.set(id, (fronts.get(id) ?? 0) + 1)
	const opening = rng.shuffle(
		[...attacks.active.values()].sort((a, b) => a.id - b.id),
	)
	for (const attack of opening) {
		const a = t.countries.get(attack.attacker),
			d = t.countries.get(attack.defender)
		if (
			!a ||
			!d ||
			!a.contacts.has(d.id) ||
			year - attack.start >= maxAttackYears
		) {
			end({
				attacks,
				territory: t,
				attack,
				year,
				reason: !a || !d ? "absorbed" : "separated",
			})
			continue
		}
		const limit = ceiling({ territory: t, countryId: a.id, target })
		const candidates = () =>
			frontier({
				territory: t,
				attacker: a.id,
				defender: d.id,
				limit,
				firstOnly: false,
			})
		let valid = candidates()
		if (!valid.length) {
			attacks.blocked++
			end({ attacks, territory: t, attack, year, reason: "blocked" })
			continue
		}
		attacks.resolved++
		attacks.attackerRatios.push(a.members.size / d.members.size)
		const attackStrength = (sizes.get(a.id) ?? 0) / (fronts.get(a.id) ?? 1),
			defenseStrength = (sizes.get(d.id) ?? 0) / (fronts.get(d.id) ?? 1)
		if (rng.random() >= captureProbability({ attackStrength, defenseStrength }))
			continue
		attacks.captureDraws++
		const count = Math.max(1, Math.floor(captureFraction * attackStrength))
		for (let i = 0; i < count && valid.length; i++) {
			const province = rng.weightedChoice(
				valid.map((candidate) => ({
					v: candidate,
					w:
						DISTRIBUTION_TERRITORY.enclosure({
							territory: t,
							attacker: a.id,
							province: candidate,
						}) ** 2,
				})),
			)
			if (province === undefined) break
			DISTRIBUTION_TERRITORY.transfer({
				territory: t,
				attacker: a.id,
				defender: d.id,
				province,
				ceiling: limit,
			})
			if (!t.countries.has(d.id)) break
			valid = candidates()
		}
	}
	for (const attack of [...attacks.active.values()]) {
		const a = t.countries.get(attack.attacker),
			d = t.countries.get(attack.defender)
		if (!a || !d || !a.contacts.has(d.id))
			end({
				attacks,
				territory: t,
				attack,
				year,
				reason: !a || !d ? "absorbed" : "separated",
			})
	}
}

function declare({
	attacks,
	territory: t,
	target,
	year,
	rng,
}: AnnualAttackParams): void {
	const observed = DISTRIBUTION_TARGETS.histogram({
		sizes: [...t.countries.values()].map((c) => c.members.size),
	})
	const fronts = new Map<number, number>()
	for (const attack of attacks.active.values())
		for (const id of [attack.attacker, attack.defender])
			fronts.set(id, (fronts.get(id) ?? 0) + 1)
	const outgoing = new Set([...attacks.active.values()].map((a) => a.attacker))
	for (const a of rng.shuffle(
		[...t.countries.values()].sort((a, b) => a.id - b.id),
	)) {
		if (
			outgoing.has(a.id) ||
			year < a.cooldown ||
			a.members.size >= ceiling({ territory: t, countryId: a.id, target })
		) {
			attacks.suppressed++
			continue
		}
		attacks.opportunities++
		const candidates = [...a.contacts.entries()]
			.sort((a, b) => a[0] - b[0])
			.filter(
				([id]) =>
					![...attacks.active.values()].some(
						(w) => w.attacker === id && w.defender === a.id,
					),
			)
			.filter(([id]) => {
				const d = t.countries.get(id),
					limit = ceiling({ territory: t, countryId: a.id, target })
				if (!d || a.members.size + d.members.size > limit) {
					attacks.rejectedCapacity++
					return false
				}
				if (
					!frontier({
						territory: t,
						attacker: a.id,
						defender: id,
						limit,
						firstOnly: true,
					}).length
				) {
					attacks.rejectedFronts++
					return false
				}
				return true
			})
			.map(([id, border]) => {
				const d = t.countries.get(id)
				if (!d) throw new Error("Stale country contact")
				const gain = mergerGain({
					observed,
					territory: t,
					attacker: a.id,
					defender: id,
					target,
				})
				const rate = completionRate({
					attackerSize: a.members.size,
					defenderSize: d.members.size,
					attackerFronts: (fronts.get(a.id) ?? 0) + 1,
					defenderFronts: (fronts.get(d.id) ?? 0) + 1,
				})
				attacks.completionRatios.push(Math.min(1, maxAttackYears * rate))
				attacks.gains.push(gain)
				attacks.biases.push(bias({ gain }))
				return {
					v: id,
					w:
						weight({
							attackerSize: a.members.size,
							defenderSize: d.members.size,
							border,
							gain,
						}) * rate,
					opportunity: opportunity({
						attackerSize: a.members.size,
						defenderSize: d.members.size,
						gain,
					}),
				}
			})
		if (
			!candidates.length ||
			rng.random() >=
				Math.min(1, 0.04 * Math.max(...candidates.map((c) => c.opportunity)))
		)
			continue
		const defender = rng.weightedChoice(candidates)
		if (defender === undefined) continue
		const attack: Attack = {
			id: attacks.nextId++,
			attacker: a.id,
			defender,
			start: year,
		}
		attacks.active.set(attack.id, attack)
		attacks.declared.push(attack)
		outgoing.add(a.id)
	}
}

export const DISTRIBUTION_ATTACKS = {
	create,
	bias,
	weight,
	captureProbability,
	completionRatio,
	ceiling,
	resolve,
	declare,
	end,
}
