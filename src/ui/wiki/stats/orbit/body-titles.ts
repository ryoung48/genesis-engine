import type { MoonBody } from "@/model/celestial/moons/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import type { SystemBody } from "@/model/celestial/system/types"
import { SIBLING_GROUP_LABEL } from "@/ui/wiki/stats/orbit/constants"
import { formatClassificationLabel } from "@/ui/wiki/stats/orbit/formatters"

export function getMoonSeedBaseName(params: {
	moon: MoonBody | undefined
	moonIndex: number
	showRealSolNames: boolean
	lunaFallback?: boolean
}): string {
	const { moon, moonIndex, showRealSolNames, lunaFallback } = params
	if (moon?.name) return moon.name
	if (showRealSolNames && lunaFallback && moonIndex === 0)
		return SOL_SYSTEM.solLunaDefault.name
	return `moon-${moonIndex + 1}`
}

export function appendSizeToTitle(
	title: string,
	sizeClass: number | undefined,
): string {
	void sizeClass
	return title
}

export function resolveOrbitBodyTitle(
	body: SystemBody,
	bodyNumber: number,
	showRealSolNames: boolean,
): string {
	const baseTitle =
		showRealSolNames && body.name
			? body.name
			: `${SIBLING_GROUP_LABEL[body.group]} ${bodyNumber}`
	return body.group === "asteroid belt"
		? baseTitle
		: appendSizeToTitle(baseTitle, body.sizeClass)
}

export function resolveMoonTitle(
	moon: MoonBody,
	moonNumber: number,
	showRealSolNames: boolean,
	fallbackRealName?: string,
): string {
	const name =
		showRealSolNames && moon.name
			? moon.name
			: showRealSolNames && fallbackRealName
				? fallbackRealName
				: `Moon ${moonNumber}`
	void moon.orbitRange
	return appendSizeToTitle(name, moon.sizeClass)
}

export function getSystemBodyKindLabel(body: SystemBody): string {
	return formatClassificationLabel(body.classification)
}
