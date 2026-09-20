import type {
	AtmosphereHazard,
	AtmosphereProfile,
} from "@/model/celestial/orbit-body/types"
import type {
	AtmosphereCodeInput,
	RollAtmosphereInput,
	RollHazardInput,
} from "@/model/celestial/planet/environment/atmosphere/types"
import { STAR } from "@/model/celestial/star"
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
// rolls a specific named hazard for a tainted atmosphere. The isExoticNeutronStar
// override (forcing "radioactive" regardless of tainted for a pulsar/magnetar
// system, World Builder's Handbook p. 228) is handled separately in
// atmosphereCodeToProfile below, once the host star's class is known there.
function rollHazards({
	rng,
	profile,
	starAgeGyr,
}: RollHazardInput): AtmosphereHazard[] {
	const breathable = profile.type === "breathable"
	const lifeless =
		profile.type === "vacuum" ||
		profile.type === "trace" ||
		profile.type === "gas" ||
		starAgeGyr < 0.1
	const extreme = !["thin", "standard", "dense"].includes(profile.subtype ?? "")
	const low = breathable && profile.subtype === "thin"
	const high = breathable && profile.subtype === "dense"
	const hazards: AtmosphereHazard[] = []
	while (hazards.length < 3) {
		const roll = DICE.roll2d6(rng) + (low ? -2 : 0) + (high ? 2 : 0)
		let kind: AtmosphereHazard["kind"]
		if (roll <= 2)
			kind =
				breathable && !extreme && hazards.length === 0
					? "low oxygen"
					: "gas mix"
		else if (roll === 3 || roll === 11) kind = "radioactive"
		else if (roll === 4 || roll === 9) kind = lifeless ? "gas mix" : "biologic"
		else if (roll === 5 || roll === 7) kind = "gas mix"
		else if (roll === 6 || roll === 10) kind = "particulates"
		else if (roll === 8) kind = "sulphur compounds"
		else
			kind =
				breathable && !extreme && hazards.length === 0
					? "high oxygen"
					: "gas mix"
		hazards.push({ kind })
		if (roll !== 10) break
	}
	return hazards
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
		// Book's Exotic Atmosphere Subtype table (p. 86), 2D6 + DMs: Size 2-4
		// DM-2; Orbit less than HZCO-1 DM-2 (this star's own deviation>=1.5,
		// i.e. closer than HZC, stands in for "less than HZCO-1" -- the
		// codebase's continuous deviation scale predates a literal per-Orbit#
		// comparison, so the book's asymmetric -1/+2 Orbit# thresholds are both
		// approximated by the same +-1.5 deviation magnitude); Orbit greater
		// than HZCO+2 DM+2 (deviation<=-1.5, farther than HZC); Runaway
		// greenhouse result DM+4 (the "telluric" classification is this
		// codebase's own runaway-greenhouse/Venus-like outcome -- see the
		// identical DM on the Corrosive/Insidious table just below). [Bug fix]
		// this used to roll 2D5 (a die this codebase invents nowhere else) with
		// a Size DM applied for sizeClass<=4 (book says 2-4 only) and no
		// runaway-greenhouse DM at all -- both replaced with the book's own
		// numbers, and the roll-to-type table below now matches the book's
		// literal per-value row (2D5's narrower 2-10 range meant "very dense"
		// was never actually reachable before).
		let roll = DICE.roll2d6(rng)
		if (params.sizeClass >= 2 && params.sizeClass <= 4) roll -= 2
		if (params.deviation >= 1.5) roll -= 2
		if (params.deviation <= -1.5) roll += 2
		if (params.classification === "telluric") roll += 4
		if (roll <= 2) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll === 3) {
			profile = {
				code,
				type: "exotic",
				subtype: "very thin",
				breathable: false,
			}
		} else if (roll === 4) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				tainted: true,
				breathable: false,
			}
		} else if (roll === 5) {
			profile = {
				code,
				type: "exotic",
				subtype: "thin",
				breathable: false,
			}
		} else if (roll === 6) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				breathable: false,
			}
		} else if (roll === 7) {
			profile = {
				code,
				type: "exotic",
				subtype: "standard",
				tainted: true,
				breathable: false,
			}
		} else if (roll === 8) {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				breathable: false,
			}
		} else if (roll === 9) {
			profile = {
				code,
				type: "exotic",
				subtype: "dense",
				tainted: true,
				breathable: false,
			}
		} else if (roll === 10 || roll === 13) {
			profile = {
				code,
				type: "exotic",
				subtype: "very dense",
				breathable: false,
			}
		} else if (roll === 12) {
			profile = {
				code,
				type: "exotic",
				subtype: "very dense",
				tainted: true,
				hazards: [
					{
						kind: "gas mix",
						occasionallyCorrosive: true,
						severity: Math.min(9, rng.randint(1, 6) + 6),
						persistence: rng.randint(1, 6) + 1,
					},
				],
				breathable: false,
			}
		} else {
			// roll 11 and 14+ (both plain "Irritant").
			profile = {
				code,
				type: "exotic",
				subtype: "very dense",
				tainted: true,
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
	if (completed.tainted && !completed.hazards) {
		completed.hazards = rollHazards({
			rng,
			profile: completed,
			starAgeGyr: params.starAgeGyr,
		})
	}
	// Book p. 228: "all planets in orbit around a pulsar or magnetar have the
	// radioactive taint or irritant... in addition to any other taints or
	// irritants" -- forced on top regardless of whether the atmosphere was
	// already tainted (a vacuum/trace atmosphere has no meaningful "taint"
	// to carry a hazard on, so those are left alone).
	if (
		completed.type !== "vacuum" &&
		completed.type !== "trace" &&
		(STAR.isPulsar({
			spectralClass: params.starSpectralClass,
			luminosityClass: params.starLuminosityClass,
		}) ||
			STAR.isMagnetar({
				spectralClass: params.starSpectralClass,
				luminosityClass: params.starLuminosityClass,
			}))
	) {
		completed.tainted = true
		if (!completed.hazards?.some((hazard) => hazard.kind === "radioactive")) {
			completed.hazards = [
				...(completed.hazards ?? []),
				{ kind: "radioactive" },
			]
		}
	}
	return completed
}

export const ATMOSPHERE = { codeToProfile: atmosphereCodeToProfile }
