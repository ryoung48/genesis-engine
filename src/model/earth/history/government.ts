import type { GovernmentType } from "@/model/society"
import { GOVERNMENT_COLORS_BY_TYPE } from "@/ui/planet/screen/display/government-colors"
import type { BlendRgbParams } from "./types"

type EarthHistoryGovernmentFamily =
	| "tribal"
	| "monarchy"
	| "republic"
	| "theocracy"

/** Ordered list of families, for building a stable-order distribution
 * (e.g. Social's "Government" chart for Earth-imported worlds). */
export const EARTH_HISTORY_GOVERNMENT_FAMILIES: readonly EarthHistoryGovernmentFamily[] =
	["tribal", "monarchy", "republic", "theocracy"]

export const EARTH_HISTORY_GOVERNMENT_FAMILY_LABELS: Record<
	EarthHistoryGovernmentFamily,
	string
> = {
	tribal: "Tribal",
	monarchy: "Monarchy",
	republic: "Republic",
	theocracy: "Theocracy",
}

/** One fixed, legend-stable color per family -- distinct from
 * getEarthHistoryGovernmentColor below, which deliberately hashes in a
 * random family subtype + blend for per-nation map-fill variety and would
 * make a distribution chart's legend inconsistent nation to nation. */
export const EARTH_HISTORY_GOVERNMENT_FAMILY_COLORS: Record<
	EarthHistoryGovernmentFamily,
	[number, number, number]
> = {
	tribal: GOVERNMENT_COLORS_BY_TYPE.tribal_monarchy,
	monarchy: GOVERNMENT_COLORS_BY_TYPE.absolute_monarchy,
	republic: GOVERNMENT_COLORS_BY_TYPE.presidential_republic,
	theocracy: GOVERNMENT_COLORS_BY_TYPE.theocracy,
}

export const EARTH_HISTORY_NO_GOVERNMENT_COLOR: [number, number, number] = [
	0.2, 0.2, 0.22,
]

const FAMILY_TYPES: Record<
	EarthHistoryGovernmentFamily,
	readonly GovernmentType[]
> = {
	tribal: [
		"chiefdom",
		"tribal_monarchy",
		"tribal_federation",
		"native_council",
		"steppe_horde",
	],
	monarchy: [
		"feudal_monarchy",
		"elective_monarchy",
		"absolute_monarchy",
		"constitutional_monarchy",
		"dynastic_signoria",
		"warlord_state",
		"shogunate",
		"bureaucratic_monarchy",
	],
	republic: [
		"merchant_republic",
		"oligarchic_republic",
		"free_city",
		"peasant_republic",
		"presidential_republic",
		"parliamentary_republic",
		"pirate_republic",
	],
	theocracy: ["theocracy", "monastic_state", "imperial_cult"],
}

function hashUint(key: string): number {
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	return h >>> 0
}

function blendRgb({ a, b, t }: BlendRgbParams): [number, number, number] {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	]
}

function toDisplayLabel(value: string): string {
	return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatGovernmentReformLabel(value: string): string {
	return toDisplayLabel(value).replace(/\s+Reform\b/g, "")
}

function normalizeGovernmentBase(governmentType: string | null): string | null {
	if (!governmentType) return null
	const normalized = governmentType.trim().toLowerCase()
	return normalized || null
}

function significantEarthHistoryReforms(
	reforms: Iterable<string> | null | undefined,
): string[] {
	return Array.from(reforms ?? [])
		.map((reform) => reform.trim().toLowerCase())
		.filter((reform) => reform && !/^early_gov_reform_\d+$/.test(reform))
		.sort()
}

function currentEarthHistoryReformLabel(
	governmentReform: string | null | undefined,
): string | null {
	const normalized = governmentReform?.trim().toLowerCase() ?? ""
	if (!normalized) return null
	return formatGovernmentReformLabel(normalized)
}

export function getEarthHistoryGovernmentFamily(
	governmentType: string | null,
): EarthHistoryGovernmentFamily | null {
	switch (normalizeGovernmentBase(governmentType)) {
		case "tribal":
		case "native":
			return "tribal"
		case "monarchy":
		case "eu_gov":
			return "monarchy"
		case "republic":
			return "republic"
		case "theocracy":
			return "theocracy"
		default:
			return null
	}
}

export function getEarthHistoryGovernmentColor(params: {
	governmentType: string | null
	governmentReform?: string | null
}): [number, number, number] | null {
	const family = getEarthHistoryGovernmentFamily(params.governmentType)
	if (!family) return null

	const types = FAMILY_TYPES[family]
	const significantReforms = significantEarthHistoryReforms(
		params.governmentReform ? [params.governmentReform] : null,
	)
	const seedKey =
		significantReforms.length > 0
			? `${family}|${significantReforms.join("|")}`
			: family
	const hash = hashUint(seedKey)

	const firstIndex = hash % types.length
	const first = GOVERNMENT_COLORS_BY_TYPE[types[firstIndex]]
	if (types.length === 1) return [...first] as [number, number, number]

	const secondIndex =
		(firstIndex + 1 + ((hash >>> 8) % (types.length - 1))) % types.length
	const second = GOVERNMENT_COLORS_BY_TYPE[types[secondIndex]]
	const t = ((hash >>> 16) & 0xff) / 255
	return blendRgb({ a: first, b: second, t: 0.2 + t * 0.6 })
}

export function formatEarthHistoryGovernmentLabel(params: {
	governmentType: string | null
	governmentReform?: string | null
}): string | null {
	const family = getEarthHistoryGovernmentFamily(params.governmentType)
	if (!family) return normalizeGovernmentBase(params.governmentType)
	const reformLabel = currentEarthHistoryReformLabel(params.governmentReform)
	if (!reformLabel) return toDisplayLabel(family)
	return `${toDisplayLabel(family)} (${reformLabel})`
}
