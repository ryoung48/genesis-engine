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
		return panthalassic ? rng.uniform(1, 1.49) : rng.uniform(0.7, 1.49)
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
		const gasRoll = rng.uniform(0, 1)
		if (!params.isPrimaryWorld && !panthalassic && gasRoll > 0.8) {
			profile = {
				code: gasRoll > 0.92 ? 17 : 16,
				type: "gas",
				subtype: gasRoll > 0.92 ? "hydrogen" : "helium",
				breathable: false,
			}
		} else {
			const breathable = params.isPrimaryWorld || !nonhabitable
			profile = {
				code: breathable ? 13 : 10,
				type: breathable ? "breathable" : "exotic",
				subtype: "very dense",
				breathable,
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
	return {
		...profile,
		pressureBar: rollAtmosphereBar({
			rng,
			profile,
			panthalassic: params.classification === "panthalassic",
		}),
	}
}

export const ATMOSPHERE = { codeToProfile: atmosphereCodeToProfile }
