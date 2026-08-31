import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import type {
	AtmosphereCodeInput,
	RollAtmosphereInput,
} from "@/model/celestial/planet/environment/atmosphere/types"
import { DICE } from "@/model/shared/random/dice"

function rollAtmosphereBar({
	rng,
	profile,
	panthalassic,
}: RollAtmosphereInput): number {
	if (profile.type === "vacuum") return rng.uniform(0, 0.0009)
	if (profile.type === "trace") return rng.uniform(0.001, 0.09)
	if (profile.subtype === "very thin") return rng.uniform(0.1, 0.42)
	if (profile.subtype === "thin") return rng.uniform(0.43, 0.69)
	if (profile.subtype === "standard" || profile.subtype === "unusual") {
		if (panthalassic) return rng.uniform(1, 1.49)
		if (profile.unusual === "steam") return rng.uniform(2.5, 5)
		return rng.uniform(0.7, 1.49)
	}
	if (profile.subtype === "dense") return rng.uniform(1.5, 2.49)
	if (profile.subtype === "very dense") return rng.uniform(2.5, 10)
	if (profile.type === "gas" && profile.subtype === "helium") {
		return rng.uniform(100, 1000)
	}
	if (profile.type === "gas" && profile.subtype === "hydrogen") {
		return rng.uniform(1000, 5000)
	}
	return 0
}

// Ported from galaxy-gen's ATMOSPHERE.taint (orbits/atmosphere/index.ts) --
// rolls a specific named hazard for a tainted atmosphere. NOT ported: the
// isExoticNeutronStar override that forces every non-vacuum/trace atmosphere
// to "radioactive" regardless of tainted, since that needs the host star's
// luminosityClass threaded all the way through classification and no caller
// here has it yet.
function rollHazard({
	rng,
	profile,
	starAgeGyr,
}: {
	rng: RollAtmosphereInput["rng"]
	profile: Pick<AtmosphereProfile, "type" | "subtype">
	starAgeGyr: number
}): AtmosphereProfile["hazard"] {
	const breathable = profile.type === "breathable"
	const lifeless =
		profile.type === "vacuum" ||
		profile.type === "trace" ||
		profile.type === "gas" ||
		starAgeGyr < 0.1
	const extreme = !["thin", "standard", "dense"].includes(profile.subtype ?? "")
	const low = breathable && profile.subtype === "thin"
	const high = breathable && profile.subtype === "dense"
	const roll = DICE.roll2d6(rng) + (low ? -2 : 0) + (high ? 2 : 0)
	if (roll <= 2) return breathable && !extreme ? "low oxygen" : "gas mix"
	if (roll === 3 || roll === 11) return "radioactive"
	if (roll === 4 || roll === 9) return lifeless ? "gas mix" : "biologic"
	if (roll === 5 || roll === 7) return "gas mix"
	if (roll === 8) return "sulphur compounds"
	if (roll === 10) return "particulates"
	return breathable && !extreme ? "high oxygen" : "gas mix"
}

function atmosphereCodeToProfile({
	rng,
	atmosphereCode,
	params,
}: AtmosphereCodeInput): AtmosphereProfile | null {
	let code = atmosphereCode
	const nonhabitable = params.deviation < -1.5 || params.deviation > 1.5
	if (params.isPrimaryWorld && (code < 4 || (code > 9 && code <= 10))) {
		code = rng.choice([5, 6, 6, 8])
	}
	if (params.sizeClass <= 1) code = Math.min(code, 1)
	else if (nonhabitable && code >= 2 && code <= 9) code = 10

	let profile: Omit<AtmosphereProfile, "pressureBar"> | null = null
	if (code === 0) profile = { code, type: "vacuum", breathable: false }
	else if (code === 1) profile = { code, type: "trace", breathable: false }
	else if (code === 2) {
		profile = {
			code,
			type: "breathable",
			subtype: "very thin",
			tainted: true,
			breathable: true,
		}
	} else if (code === 3) {
		profile = {
			code,
			type: "breathable",
			subtype: "very thin",
			breathable: true,
		}
	} else if (code === 4) {
		profile = {
			code,
			type: "breathable",
			subtype: "thin",
			tainted: true,
			breathable: true,
		}
	} else if (code === 5) {
		profile = {
			code,
			type: "breathable",
			subtype: "thin",
			breathable: true,
		}
	} else if (code === 6) {
		profile = {
			code,
			type: "breathable",
			subtype: "standard",
			breathable: true,
		}
	} else if (code === 7) {
		profile = {
			code,
			type: "breathable",
			subtype: "standard",
			tainted: true,
			breathable: true,
		}
	} else if (code === 8) {
		profile = {
			code,
			type: "breathable",
			subtype: "dense",
			breathable: true,
		}
	} else if (code === 9) {
		profile = {
			code,
			type: "breathable",
			subtype: "dense",
			tainted: true,
			breathable: true,
		}
	} else if (code === 10) {
		let roll = DICE.roll2d5(rng)
		if (params.sizeClass <= 4) roll -= 2
		if (params.deviation >= 1.5) roll -= 2
		if (params.deviation <= -1.5) roll += 2
		if (roll <= 2) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 3) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				breathable: false,
			}
		} else if (roll <= 4) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 5) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				breathable: false,
			}
		} else if (roll <= 6) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				tainted: true,
				breathable: false,
			}
		} else if (roll <= 8) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				breathable: false,
			}
		} else if (roll <= 9) {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				tainted: true,
				breathable: false,
			}
		} else {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				breathable: false,
			}
		}
	} else if (code === 11 || code === 12) {
		let roll = DICE.roll2d6(rng)
		if (params.sizeClass <= 4) roll -= 3
		if (params.sizeClass >= 8) roll += 2
		if (params.deviation >= 1.5) roll += 4
		if (params.deviation <= -1.5) roll -= 2
		if (code === 12) roll += 2
		if (params.classification === "telluric") roll += 4
		profile = {
			code,
			type: code === 12 ? "insidious" : "corrosive",
			subtype:
				roll <= 3
					? "very thin"
					: roll <= 5
						? "thin"
						: roll <= 7
							? "standard"
							: roll <= 10
								? "dense"
								: "very dense",
			breathable: false,
		}
	} else if (code === 13) {
		const panthalassic = params.classification === "panthalassic"
		// Ported from galaxy-gen's ATMOSPHERE.finalize code-13 branch: a
		// weighted roll over the "very dense" tail, plus -- for a non-primary
		// world -- a real chance of a thin ("Low" / code 14 / "E"), anomalous
		// ("Unusual" / code 15 / "F"), or gas-envelope (helium/hydrogen)
		// outcome instead of always collapsing to "very dense".
		const subtype = params.isPrimaryWorld
			? (rng.weightedChoice([
					{ v: "very dense" as const, w: 1 },
					{ v: "very thin" as const, w: panthalassic ? 0 : 1 },
				]) ?? "very dense")
			: (rng.weightedChoice([
					{ v: "very dense" as const, w: 1 },
					{ v: "very thin" as const, w: panthalassic ? 0 : 1 },
					{ v: "unusual" as const, w: 0.5 },
					{ v: "helium" as const, w: panthalassic ? 0 : 0.5 },
					{ v: "hydrogen" as const, w: panthalassic ? 0 : 0.25 },
				]) ?? "very dense")
		if (subtype === "helium" || subtype === "hydrogen") {
			profile = {
				code: subtype === "helium" ? 16 : 17,
				type: "gas",
				subtype,
				breathable: false,
			}
		} else {
			const composition = params.isPrimaryWorld
				? "breathable"
				: (rng.weightedChoice([
						{ v: "breathable" as const, w: nonhabitable ? 0 : 5 },
						{ v: "exotic" as const, w: 1 },
					]) ?? "breathable")
			profile = {
				code:
					composition === "exotic"
						? 10
						: subtype === "very dense"
							? 13
							: subtype === "very thin"
								? 14
								: 15,
				type: composition,
				subtype,
				breathable: composition === "breathable",
				unusual:
					subtype === "unusual"
						? (rng.weightedChoice([
								{ v: "ellipsoid" as const, w: 1 },
								{ v: "layered" as const, w: params.gravityG > 1.2 ? 1 : 0 },
								{ v: "high radiation" as const, w: 1 },
								{
									v: "steam" as const,
									w: panthalassic || params.hydrosphereCode < 5 ? 0 : 1,
								},
								{ v: "storms" as const, w: 1 },
								{ v: "tides" as const, w: params.hydrosphereCode < 5 ? 0 : 1 },
								{ v: "seasonal" as const, w: 1 },
							]) ?? "ellipsoid")
						: undefined,
			}
		}
	} else if (code === 16 || code === 17 || code === 14) {
		profile = {
			code: code === 14 ? 17 : code,
			type: "gas",
			subtype: code === 16 ? "helium" : "hydrogen",
			breathable: false,
		}
	}

	if (!profile) return null
	const completed: AtmosphereProfile = {
		...profile,
		pressureBar: rollAtmosphereBar({
			rng,
			profile,
			panthalassic: params.classification === "panthalassic",
		}),
	}
	if (completed.tainted) {
		completed.hazard = rollHazard({
			rng,
			profile: completed,
			starAgeGyr: params.starAgeGyr,
		})
	}
	return completed
}

export const ATMOSPHERE = { codeToProfile: atmosphereCodeToProfile }
