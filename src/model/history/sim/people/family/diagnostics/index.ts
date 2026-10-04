import type {
	MarriageTotals,
	MergeMarriageParams,
	ObserveMarriageParams,
	SearchTotals,
	SelectionTotals,
} from "@/model/history/sim/people/family/diagnostics/types"

function search(): SearchTotals {
	return {
		searches: 0,
		visited: 0,
		hardEligible: 0,
		kinship: 0,
		evaluated: 0,
		observerOnly: 0,
		candidateOnly: 0,
		bothNegative: 0,
		several: 0,
		ranking: 0,
		rejection: 0,
		unchanged: 0,
		scoringMs: 0,
	}
}

function selection(): SelectionTotals {
	return {
		selected: 0,
		components: {
			attraction: 0,
			opinion: 0,
			age: 0,
			standing: 0,
			alliance: 0,
			desperation: 0,
			total: 0,
		},
		opinionComponents: {
			personality: 0,
			culture: 0,
			religion: 0,
			reputation: 0,
			kin: 0,
			spouse: 0,
			memories: 0,
			unclamped: 0,
			total: 0,
		},
		currentStanding: 0,
		projectedStanding: 0,
		ageGap: 0,
		culture: { known: 0, same: 0 },
		heritage: { known: 0, same: 0 },
		religion: { known: 0, same: 0 },
		rulersByTier: [0, 0, 0, 0, 0],
	}
}

function create(): MarriageTotals {
	return {
		searches: { domestic: search(), foreign: search() },
		selections: {
			domestic: selection(),
			foreign: selection(),
			betrothal: selection(),
			outsider: selection(),
		},
		fallback: {
			through25: { opportunities: 0, attempts: 0, accepted: 0 },
			"26to29": { opportunities: 0, attempts: 0, accepted: 0 },
			"30to34": { opportunities: 0, attempts: 0, accepted: 0 },
			"35plus": { opportunities: 0, attempts: 0, accepted: 0 },
		},
		projectionRefreshes: 0,
		projectionMs: 0,
		ancestrySets: 0,
		ancestryMemberships: 0,
		kinshipReleases: 0,
	}
}

function observe({ totals, observation: row }: ObserveMarriageParams): void {
	if (row.kind === "search") {
		const target = totals.searches[row.group]
		target.searches++
		for (const key of [
			"visited",
			"hardEligible",
			"kinship",
			"evaluated",
			"observerOnly",
			"candidateOnly",
			"bothNegative",
			"scoringMs",
		] as const)
			target[key] += row[key]
		if (row.evaluated >= 2) target.several++
		if (row.firstFit !== "empty") target[row.firstFit]++
	} else if (row.kind === "selection") {
		const target = totals.selections[row.group]
		target.selected++
		for (const score of [row.first, row.second]) {
			for (const key of Object.keys(
				target.components,
			) as (keyof SelectionTotals["components"])[])
				target.components[key] += score[key]
			for (const key of Object.keys(
				target.opinionComponents,
			) as (keyof SelectionTotals["opinionComponents"])[])
				target.opinionComponents[key] += score.breakdown[key]
		}
		target.currentStanding += row.current[0] + row.current[1]
		target.projectedStanding += row.projected[0] + row.projected[1]
		target.ageGap += Math.abs(row.a.age - row.b.age)
		for (const key of ["culture", "heritage", "religion"] as const)
			if (row.a[key] >= 0 && row.b[key] >= 0) {
				target[key].known++
				if (row.a[key] === row.b[key]) target[key].same++
			}
		for (const tier of row.tiers) target.rulersByTier[tier]++
	} else if (row.kind === "fallback") {
		const bin =
			row.age <= 25
				? "through25"
				: row.age < 30
					? "26to29"
					: row.age < 35
						? "30to34"
						: "35plus"
		const target = totals.fallback[bin]
		target.opportunities++
		target.attempts += Number(row.attempt)
		target.accepted += Number(row.accepted)
	} else if (row.kind === "projection") {
		totals.projectionRefreshes++
		totals.projectionMs += row.ms
	} else if (row.kind === "kinship release") totals.kinshipReleases++
	else {
		totals.ancestrySets = Math.max(totals.ancestrySets, row.sets)
		totals.ancestryMemberships = Math.max(
			totals.ancestryMemberships,
			row.memberships,
		)
	}
}

function merge({ target, source }: MergeMarriageParams): void {
	for (const group of ["domestic", "foreign"] as const)
		for (const key of Object.keys(
			target.searches[group],
		) as (keyof SearchTotals)[])
			target.searches[group][key] += source.searches[group][key]
	for (const group of [
		"domestic",
		"foreign",
		"betrothal",
		"outsider",
	] as const) {
		const a = target.selections[group]
		const b = source.selections[group]
		for (const key of [
			"selected",
			"currentStanding",
			"projectedStanding",
			"ageGap",
		] as const)
			a[key] += b[key]
		for (const key of Object.keys(
			a.components,
		) as (keyof SelectionTotals["components"])[])
			a.components[key] += b.components[key]
		for (const key of Object.keys(
			a.opinionComponents,
		) as (keyof SelectionTotals["opinionComponents"])[])
			a.opinionComponents[key] += b.opinionComponents[key]
		for (const key of ["culture", "heritage", "religion"] as const) {
			a[key].known += b[key].known
			a[key].same += b[key].same
		}
		for (let tier = 0; tier < 5; tier++)
			a.rulersByTier[tier] += b.rulersByTier[tier]
	}
	for (const bin of ["through25", "26to29", "30to34", "35plus"] as const)
		for (const key of ["opportunities", "attempts", "accepted"] as const)
			target.fallback[bin][key] += source.fallback[bin][key]
	for (const key of [
		"projectionRefreshes",
		"projectionMs",
		"kinshipReleases",
	] as const)
		target[key] += source[key]
	for (const key of ["ancestrySets", "ancestryMemberships"] as const)
		target[key] = Math.max(target[key], source[key])
}

export const MARRIAGE_DIAGNOSTICS = { create, observe, merge }
