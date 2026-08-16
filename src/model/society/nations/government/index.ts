import { ERAS } from "@/model/society/eras"
import type {
	AssignGovernmentTypeParams,
	RefineGovernmentSubtypeParams,
} from "@/model/society/nations/government/types"
import type { GovernmentFamily, GovernmentType } from "@/model/society/types"

let _govIdx: Record<GovernmentType, number> | null = null

function getGovIdx(): Record<GovernmentType, number> {
	if (!_govIdx) {
		_govIdx = Object.fromEntries(
			ERAS.governmentTypes.map((type, index) => [type, index]),
		) as Record<GovernmentType, number>
	}
	return _govIdx
}

function govFamilyOfIndex(index: number): GovernmentFamily {
	const type = ERAS.governmentTypes[index]
	return type ? ERAS.governmentTypeFamily[type] : "monarchy"
}

function assignGovernmentType({
	nationIndex,
	capitalProvince,
	nationSize,
	eraMix,
	sizeWeight,
	habitability,
	waterAccess,
	migrationWave,
	statehoodFraction,
	seed,
}: AssignGovernmentTypeParams): number {
	// Look up size prior
	const prior =
		SIZE_GOV_PRIORS.find((p) => nationSize <= p.maxSize) ??
		SIZE_GOV_PRIORS[SIZE_GOV_PRIORS.length - 1]

	// Tribal governments require stateless social organization to draw from.
	// As statehood becomes universal (statehoodFraction → 1, e.g. information age)
	// there is no stateless land left, so the tendency toward tribal — both from
	// era ideology and from small size — fades to zero. Ramps over the final 30%.
	const statelessScale = Math.max(0, Math.min(1, (1 - statehoodFraction) / 0.3))
	// Premodern eras can still sustain frontier/tribal polities even at nominal
	// full state coverage. This decays with political modernity and reaches zero
	// in the information age.
	const residualFrontierScale = Math.max(
		0,
		Math.min(1, (sizeWeight - 0.15) / (0.55 - 0.15)),
	)
	const frontierCompensationScale = Math.sqrt(residualFrontierScale)
	const tribalSizeScale = Math.max(
		statelessScale,
		frontierCompensationScale * 0.6,
	)
	const frontierTribalScale = Math.max(
		statelessScale,
		frontierCompensationScale,
	)

	// Blend era mix with size prior using era-dependent weight.
	// sizeWeight=1: size alone drives gov (ancient). sizeWeight=0: era ideology alone.
	// The size prior's tribal share is reduced in late eras, but premodern worlds
	// still retain some small-polity tribal bias even after stateless land vanishes.
	const eraWeight = 1 - sizeWeight
	let tribal =
		eraMix.tribal * eraWeight + prior.tribal * sizeWeight * tribalSizeScale
	let monarchy = eraMix.monarchy * eraWeight + prior.monarchy * sizeWeight
	let republic = eraMix.republic * eraWeight + prior.republic * sizeWeight
	let theocracy = eraMix.theocracy * eraWeight + prior.theocracy * sizeWeight

	// High water access (coastal + river trade nodes) → boost republic.
	// Scaled by sizeWeight: matters less in modern eras where ideology drives gov.
	const water = waterAccess[capitalProvince] ?? 0
	if (water > 0) {
		const boost = Math.min(water, 2) * 0.08 * sizeWeight
		republic += boost
		tribal -= boost * 0.6
		monarchy -= boost * 0.4
	}

	// Low habitability → boost tribal.
	// Scaled by sizeWeight: geography matters less in modern eras.
	const hab = habitability[capitalProvince] ?? 0.5
	if (hab < 0.35) {
		const boost = (0.35 - hab) * 0.6 * sizeWeight
		tribal += boost
		monarchy -= boost * 0.55
		republic -= boost * 0.25
		theocracy -= boost * 0.2
	}

	// Migration wave: the closer a nation is to the settlement frontier, the more
	// tribal it should be. Premodern eras preserve this skew even after every
	// settled province belongs to a state; modern eras largely suppress it.
	const wave = migrationWave?.[capitalProvince] ?? -1
	if (wave >= 0) {
		const frontierBoost = wave * wave * 2.0 * frontierTribalScale
		tribal += frontierBoost
		monarchy -= frontierBoost * 0.5
		republic -= frontierBoost * 0.35
		theocracy -= frontierBoost * 0.15

		// Core pull: ancient settlement entrenches state institutions
		const coreBoost = (1 - wave) * (1 - wave) * 0.35
		monarchy += coreBoost * 0.55
		republic += coreBoost * 0.3
		theocracy += coreBoost * 0.15
		tribal -= coreBoost
	}

	// Clamp negatives and renormalize
	tribal = Math.max(0, tribal)
	monarchy = Math.max(0, monarchy)
	republic = Math.max(0, republic)
	theocracy = Math.max(0, theocracy)
	const total = tribal + monarchy + republic + theocracy || 1
	tribal /= total
	monarchy /= total
	republic /= total
	theocracy /= total

	// Deterministic draw from the blended distribution
	let h = ((seed + 7919) ^ (nationIndex * 2654435761)) >>> 0
	h ^= h >>> 16
	h = Math.imul(h, 0x45d9f3b)
	h ^= h >>> 16
	const r = (h >>> 0) / 0xffffffff

	let mainType: number
	if (r < tribal) mainType = 0
	else if (r < tribal + monarchy) mainType = 1
	else if (r < tribal + monarchy + republic) mainType = 2
	else mainType = 3

	// Second hash — independent seed for subtype draw
	let h2 = ((seed + 31337) ^ (nationIndex * 1234577)) >>> 0
	h2 ^= h2 >>> 16
	h2 = Math.imul(h2, 0x45d9f3b)
	h2 ^= h2 >>> 16
	const r2 = (h2 >>> 0) / 0xffffffff

	return refineGovernmentSubtype({
		mainType,
		size: nationSize,
		wave,
		hab,
		water,
		sizeWeight,
		r: r2,
	})
}

function refineGovernmentSubtype({
	mainType,
	size,
	wave,
	hab,
	water,
	sizeWeight,
	r,
}: RefineGovernmentSubtypeParams): number {
	switch (mainType) {
		case 0: {
			// tribal → chiefdom, tribal monarchy, tribal federation, native council, steppe horde
			// Steppe hordes: large, arid/frontier nomadic confederations (Mongols, Huns, Xiongnu).
			if (size >= 15 && hab < 0.4 && r < 0.4) return getGovIdx().steppe_horde
			if (size >= 10)
				return r < 0.55
					? getGovIdx().tribal_federation
					: getGovIdx().tribal_monarchy
			if (size >= 5) return getGovIdx().tribal_monarchy
			// frontier/harsh → mostly native council; core → mostly chiefdom
			return r < (wave > 0.35 || hab < 0.35 ? 0.35 : 0.7)
				? getGovIdx().chiefdom
				: getGovIdx().native_council
		}

		case 1: {
			// monarchy → feudal, elective, absolute, constitutional, warlord state
			// Information era (sizeWeight ~0.15): constitutional dominant, a few
			// absolute holdouts (Gulf-style states).
			if (sizeWeight < 0.22) {
				if (size >= 12 && r < 0.3) return getGovIdx().absolute_monarchy // absolute holdout
				return getGovIdx().constitutional_monarchy
			}
			// Industrial era (~0.30): constitutional rises, absolute for medium+,
			// no surviving feudalism. Warlord states can emerge from post-imperial
			// collapse (Warlord-Era China is squarely this era).
			if (sizeWeight < 0.4) {
				if (size >= 6 && r < 0.15) return getGovIdx().warlord_state
				if (r < 0.55) return getGovIdx().constitutional_monarchy
				if (size >= 6) return getGovIdx().absolute_monarchy
				return getGovIdx().constitutional_monarchy
			}
			// Early modern (~0.45): age of absolutism; elective and feudal persist;
			// constitutional begins to emerge.
			if (sizeWeight < 0.55) {
				if (size >= 8 && r < 0.45) return getGovIdx().absolute_monarchy // medium+
				if (size >= 8 && r < 0.65) return getGovIdx().elective_monarchy // medium+ (Poland, HRE)
				if (r < 0.88) return getGovIdx().feudal_monarchy // still widespread
				return getGovIdx().constitutional_monarchy // early constitutional
			}
			// Ancient & medieval (>=0.55): feudal default; elective for medium+
			// kingdoms; absolute for large empires.
			if (size >= 20 && r < 0.65) return getGovIdx().absolute_monarchy
			if (size >= 5 && r < 0.75) return getGovIdx().elective_monarchy // medium+ kingdoms
			return getGovIdx().feudal_monarchy // default
		}

		case 2: {
			// republic → oligarchic, dynastic signoria, free city, presidential,
			// parliamentary, pirate republic, socialist, junta, fascist, dictatorial
			// Information era: socialist states emerge alongside parliamentary,
			// presidential, juntas, and personalist dictatorships. Fascism is a
			// 20th-century-specific (WWII) phenomenon, excluded here.
			if (sizeWeight < 0.22) {
				if (size >= 20 && r < 0.28) return getGovIdx().socialist_state // large one-party states
				if (r < 0.12) return getGovIdx().socialist_state // minority elsewhere
				if (r < 0.22) return getGovIdx().military_junta
				if (r < 0.3) return getGovIdx().dictatorial_rule // personalist autocracy
				if (r < 0.62) return getGovIdx().parliamentary_republic
				return getGovIdx().presidential_republic
			}
			// Industrial era: no socialist states (predates 1917); juntas dominate
			// unstable republics (Latin America); fascism appears here (WWII-era
			// totalitarian nationalist regimes); parliamentary in France/Europe,
			// presidential in the USA.
			if (sizeWeight < 0.4) {
				if (r < 0.08) return getGovIdx().fascist_state
				if (r < 0.32) return getGovIdx().military_junta
				if (r < 0.72) return getGovIdx().parliamentary_republic
				return getGovIdx().presidential_republic
			}
			// Pre-modern republics
			if (size === 1 && r < 0.3) return getGovIdx().free_city
			if (water >= 2 && size <= 3 && r < 0.06)
				return getGovIdx().pirate_republic // small remote coastal havens
			if (size <= 4 && hab >= 0.3 && r < 0.25)
				return getGovIdx().peasant_republic // lord-less free-peasant commune
			if (water >= 2 && size <= 10 && wave >= 0 && wave < 0.35)
				return getGovIdx().free_city // coastal core
			if (water >= 1 && size <= 6 && wave >= 0 && wave < 0.3 && r < 0.55)
				return getGovIdx().free_city
			// Dynastic signoria (a princely lord ruling what was a republic, e.g.
			// Medici Florence, Visconti Milan) shares oligarchic republic's core-only
			// condition rather than a size cap — a coin flip decides which one a
			// settled, non-frontier core polity becomes.
			if (size >= 8 && wave >= 0 && wave < 0.28)
				return r < 0.5
					? getGovIdx().dynastic_signoria
					: getGovIdx().oligarchic_republic
			if (wave >= 0 && wave < 0.28 && r < 0.15)
				return getGovIdx().dynastic_signoria
			return getGovIdx().free_city // default
		}

		case 3: {
			// theocracy → theocracy, monastic state, imperial cult
			// Imperial cult: large, early modern and earlier only (no industrial/information)
			if (size >= 20 && sizeWeight >= 0.4)
				return r < 0.45 ? getGovIdx().imperial_cult : getGovIdx().theocracy
			if (size >= 10) return getGovIdx().theocracy // medium+
			if (water >= 1 && r < 0.55) return getGovIdx().monastic_state // coastal small
			return getGovIdx().theocracy // default
		}
	}
	return getGovIdx().chiefdom
}

const SIZE_GOV_PRIORS: Array<{
	maxSize: number
	tribal: number
	monarchy: number
	republic: number
	theocracy: number
}> = [
	{ maxSize: 1, tribal: 0.72, monarchy: 0.12, republic: 0.12, theocracy: 0.04 },
	{ maxSize: 4, tribal: 0.55, monarchy: 0.26, republic: 0.12, theocracy: 0.07 },
	{ maxSize: 9, tribal: 0.28, monarchy: 0.52, republic: 0.1, theocracy: 0.1 },
	{ maxSize: 24, tribal: 0.1, monarchy: 0.64, republic: 0.1, theocracy: 0.16 },
	{
		maxSize: 49,
		tribal: 0.03,
		monarchy: 0.72,
		republic: 0.08,
		theocracy: 0.17,
	},
	{
		maxSize: 99,
		tribal: 0.01,
		monarchy: 0.77,
		republic: 0.07,
		theocracy: 0.15,
	},
	{
		maxSize: Infinity,
		tribal: 0.0,
		monarchy: 0.82,
		republic: 0.08,
		theocracy: 0.1,
	},
]

export const GOVERNMENT = {
	getGovIdx,
	govFamilyOfIndex,
	assignGovernmentType,
}
