import { YEAR_MS } from "@/model/history/state"
import {
	leaderGenderSymbol,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"

interface RulerDisplayMeta {
	age: number | null
	gender: "male" | "female" | null
	genderSymbol: string | null
	claimStrength: string | null
	isRegency: boolean
}

function formatClaimStrength(claim: number | null | undefined): string | null {
	if (claim == null || claim < 0) return null
	if (claim >= 3) return "Strong claim"
	if (claim >= 2) return "Average claim"
	if (claim >= 1) return "Weak claim"
	return "No claim"
}

export function buildRulerDisplayMeta(params: {
	world: SerializedGenesisWorld | null
	nationId: number
	timeMs: number | null | undefined
}): RulerDisplayMeta {
	const { world, nationId, timeMs } = params
	const birthYear = world?.leaderBirthYear?.[nationId] ?? -1
	const age =
		timeMs != null && Number.isFinite(birthYear) && birthYear >= 0
			? Math.max(0, Math.floor(timeMs / YEAR_MS - birthYear))
			: null
	const leaderSeed = world?.leaderNameSeed?.[nationId] ?? -1
	const cultureId = world?.cultures?.assignment?.[nationId] ?? -1
	const cultureGenderSystem =
		cultureId >= 0 ? world?.cultures?.genderSystems?.[cultureId] : undefined
	const gender =
		leaderSeed >= 0
			? resolveLeaderGender(cultureGenderSystem, leaderSeed)
			: null
	return {
		age,
		gender,
		genderSymbol: leaderGenderSymbol(gender),
		claimStrength: formatClaimStrength(world?.leaderClaim?.[nationId] ?? null),
		isRegency: age !== null && age < 16,
	}
}
