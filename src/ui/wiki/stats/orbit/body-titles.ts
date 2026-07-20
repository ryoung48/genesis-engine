import type { MoonBody } from "@/model/celestial/moons/moon-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import { SOL_LUNA_DEFAULT } from "@/model/celestial/system/sol-system"
import { SIBLING_GROUP_LABEL } from "./constants"
import { formatClassificationLabel } from "./formatters"

export function getMoonSeedBaseName(params: {
	moon: MoonBody | undefined
	moonIndex: number
	showRealSolNames: boolean
	lunaFallback?: boolean
}): string {
	const { moon, moonIndex, showRealSolNames, lunaFallback } = params
	if (moon?.name) return moon.name
	if (showRealSolNames && lunaFallback && moonIndex === 0)
		return SOL_LUNA_DEFAULT.name
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
