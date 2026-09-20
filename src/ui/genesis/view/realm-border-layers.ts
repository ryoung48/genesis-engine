import { FRAME } from "@/model/history/world-frame"
import type { RealmBorderLayer } from "@/ui/genesis/renderer/types"
import { TITLE_BORDER_TIERS } from "@/ui/genesis/shared/map-modes"
import { TITLE_TIER_COLORS } from "@/ui/genesis/shared/title-colors"
import type { BuildRealmBorderLayersParams } from "@/ui/genesis/view/types"

const BARONY_BORDER_COLOR: [number, number, number] = [0.08, 0.08, 0.08]
const BORDER_DARKEN = 0.2

const LINE_WIDTHS = {
	barony: 0.8,
	county: 1.2,
	duchy: 1.8,
	kingdom: 2.4,
	empire: 3,
	hegemony: 3.6,
} as const

function tierColor(tier: keyof typeof LINE_WIDTHS): [number, number, number] {
	if (tier === "barony") return BARONY_BORDER_COLOR
	const [r, g, b] = TITLE_TIER_COLORS[tier]
	return [r * BORDER_DARKEN, g * BORDER_DARKEN, b * BORDER_DARKEN]
}

const MARKER_SIZES = {
	barony: { globe: 0.001, map: 0.0003 },
	county: { globe: 0.0015, map: 0.0004 },
	duchy: { globe: 0.0022, map: 0.0006 },
	kingdom: { globe: 0.0032, map: 0.00085 },
	empire: { globe: 0.0045, map: 0.0011 },
	hegemony: { globe: 0.006, map: 0.0015 },
} as const

function markerFillColor(
	tier: keyof typeof LINE_WIDTHS,
): [number, number, number] {
	return tier === "barony" ? [0.9, 0.88, 0.8] : [...TITLE_TIER_COLORS[tier]]
}

function buildMarkerRegions({
	frame,
	world,
	tier,
}: Pick<BuildRealmBorderLayersParams, "frame" | "world"> & {
	tier: keyof typeof LINE_WIDTHS
}): Int32Array {
	const { seeds } = world.provinces
	const owned = (province: number) => frame.provinceNation[province] >= 0
	const regions: number[] = []
	if (tier === "barony") {
		const { locations } = world
		if (!locations) return new Int32Array(0)
		for (let location = 0; location < locations.count; location++)
			if (owned(locations.locationProvince[location]))
				regions.push(locations.seeds[location])
	} else if (tier === "county") {
		for (let province = 0; province < frame.provinceCount; province++)
			if (owned(province)) regions.push(seeds[province])
	} else {
		const realm = FRAME.provinceTierRealm({ frame, tier })
		for (let province = 0; province < frame.provinceCount; province++)
			if (realm[province] === province && owned(province))
				regions.push(seeds[province])
	}
	return Int32Array.from(regions.filter((region) => region >= 0))
}

function buildRegionRealms({
	frame,
	world,
	tier,
}: Pick<BuildRealmBorderLayersParams, "frame" | "world"> & {
	tier: keyof typeof LINE_WIDTHS
}): Int32Array {
	const { regionProvince } = world.provinces
	const regionRealm = new Int32Array(regionProvince.length).fill(-1)
	const realmByProvince =
		tier === "barony" || tier === "county"
			? null
			: FRAME.provinceTierRealm({ frame, tier })
	for (let region = 0; region < regionProvince.length; region++) {
		const province = regionProvince[region]
		if (province < 0 || frame.provinceNation[province] < 0) continue
		if (tier === "barony")
			regionRealm[region] = world.locations?.regionLocation[region] ?? province
		else if (tier === "county") regionRealm[region] = province
		else regionRealm[region] = realmByProvince?.[province] ?? -1
	}
	return regionRealm
}

export function buildRealmBorderLayers({
	frame,
	world,
	tiers,
}: BuildRealmBorderLayersParams): RealmBorderLayer[] {
	return TITLE_BORDER_TIERS.filter((tier) => tiers.includes(tier)).map(
		(tier) => ({
			regionRealm: buildRegionRealms({ frame, world, tier }),
			color: tierColor(tier),
			linewidth: LINE_WIDTHS[tier],
			markerRegions: buildMarkerRegions({ frame, world, tier }),
			markerColor: markerFillColor(tier),
			globeMarkerSize: MARKER_SIZES[tier].globe,
			mapMarkerRadius: MARKER_SIZES[tier].map,
		}),
	)
}
