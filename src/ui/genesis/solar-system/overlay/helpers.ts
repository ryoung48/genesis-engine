import { MOON } from "@/model/celestial/moons"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { SystemBody } from "@/model/celestial/system/types"
import {
	getMoonOrbitDistanceRelativeToPlanet,
	measureMoonOrbitOuterRadiusForDisplay,
	scaleBodyDiameterToVisualRadius,
} from "@/ui/genesis/shared/moon-visual-scale"
import {
	GROUP_LABEL,
	MIN_MOON_VISUAL_RADIUS,
	MOON_SYSTEM_SCENE_MAX,
	MOON_SYSTEM_SCENE_MIN,
	PLANET_SCENE_RADIUS,
} from "@/ui/genesis/solar-system/overlay/constants"

// `showRealNames` gates real Sol names the same way the stat-panel titles
// do (see GenerationPanel's resolveSiblingBodyTitle) — off by default so a
// procedurally generated system's bodies read as "Terrestrial Planet 2"
// etc. rather than borrowing unrelated real names baked into the Sol seed
// data.
export function bodyDisplayName(
	body: SystemBody,
	siblingNumber: number,
	showRealNames: boolean,
	namesEnabled: boolean,
): string {
	if (body.isMainWorld) {
		if (showRealNames) return "Earth"
		if (namesEnabled && body.name) return body.name
		return "Main World"
	}
	if (namesEnabled && body.name) return body.name
	return `${GROUP_LABEL[body.group]} ${siblingNumber}`
}

export function bodySceneRadius(
	diameterKm: number,
	sizeClass: number,
	realisticSizes: boolean,
): number {
	return scaleBodyDiameterToVisualRadius(
		diameterKm,
		PLANET_SCENE_RADIUS,
		realisticSizes,
		sizeClass,
	)
}

export function measureBodyMoonSystemOuterRadius(
	body: SystemBody,
	sceneRadius: number,
	showEllipticalOrbits: boolean,
	realisticSizes: boolean,
): number {
	if (body.moons.length === 0) return sceneRadius

	const planetRadiusKm = body.diameterKm / 2
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
	const parentOccupiedRadiusRelativeToPlanet =
		body.rings?.outerRadiusRelative ?? 1

	const outerRadiusInMoonOverlayUnits = measureMoonOrbitOuterRadiusForDisplay({
		orbits: body.moons.map((moon) => ({
			orbitalDistancePlanetRadii: getMoonOrbitDistanceRelativeToPlanet(
				MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }),
				planetRadiusKm,
			),
			eccentricity: showEllipticalOrbits ? moon.eccentricity : 0,
			bodyVisualRadius: Math.max(
				MIN_MOON_VISUAL_RADIUS,
				scaleBodyDiameterToVisualRadius(
					moon.diameterKm,
					PLANET_SCENE_RADIUS,
					realisticSizes,
					moon.sizeClass ??
						MOON.estimateMoonSizeClassFromDiameter(moon.diameterKm),
				) / Math.max(sceneRadius, 1e-6),
			),
		})),
		parentVisualRadius: parentOccupiedRadiusRelativeToPlanet,
		minDisplayDistance: MOON_SYSTEM_SCENE_MIN,
		maxDisplayDistance: MOON_SYSTEM_SCENE_MAX,
	})

	return outerRadiusInMoonOverlayUnits * sceneRadius
}
