import * as THREE from "three"
import type { Text } from "troika-three-text"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { SystemBody } from "@/model/celestial/system/types"
import { uiPalette } from "@/ui/components/tokens"
import {
	createNameLabel,
	createNameLeaderLine,
	IDENTITY_QUATERNION,
	sizeNameLabel,
	updateLabelPlacement,
} from "@/ui/genesis/renderer/body-name-label"
import { boostCloudAlphaMap } from "@/ui/genesis/renderer/cloud-material"
import {
	buildMoonOrbitOverlay,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "@/ui/genesis/renderer/moon-orbit-overlay"
import { scaleBodyDiameterToVisualRadius } from "@/ui/genesis/shared/moon-visual-scale"
import {
	buildAsteroidField,
	updateAsteroidField,
} from "@/ui/genesis/solar-system/overlay/asteroid-field"
import {
	BELT_SCENE_RADIUS,
	BELT_WIDTH,
	CLASSIFICATION_COLOR,
	DEG2RAD,
	FULL_OCEAN_COLOR,
	GOLDEN_ANGLE_RAD,
	MAIN_WORLD_COLOR,
	ORBIT_GAP_STAR_RADII,
	ORBIT_SEGMENTS,
	PLANET_SCENE_RADIUS,
	ROCKY_SIBLING_COLOR,
	STAR_COLOR_BY_CLASS,
	TWO_PI,
} from "@/ui/genesis/solar-system/overlay/constants"
import {
	bodyDisplayName,
	bodySceneRadius,
	measureBodyMoonSystemOuterRadius,
} from "@/ui/genesis/solar-system/overlay/helpers"
import {
	createStarGlowTexture,
	loadBodyTexture,
	loadGrayscaleSunTexture,
} from "@/ui/genesis/solar-system/overlay/textures"
import type {
	OrbitAddress,
	PlacedBody,
	PlacedCompanion,
	SolarSystemOverlayParams,
	SolarSystemOverlayState,
} from "@/ui/genesis/solar-system/overlay/types"

// Companions are packed by rendered size (like every other orbit -- see
// ORBIT_GAP_STAR_RADII's own comment: a real AU-based distance would either
// bunch everything near the star or spread it beyond any reasonable camera
// distance depending on spectral class), not a literal AU-to-scene-unit
// conversion -- this constant is just the companion-scale equivalent of
// ORBIT_GAP_STAR_RADII, one level up.
const COMPANION_ORBIT_GAP_FACTOR = 0.4
const COMPANION_ORBIT_LINE_COLOR = 0xfbbf24

/**
 * Builds one star's full worth of orbiting bodies -- the star mesh/glow/
 * light, every sibling+main-world body (with its own nested moon overlay),
 * and any companion stars (each its own recursive call to this same
 * function, mounted in a group that orbits this star) -- all packed
 * together in ONE distance-ordered pass, exactly mirroring galaxy-gen's own
 * populateOrbitals (which sorts `[...companions, ...satellites]` by
 * deviation and walks that single combined list outward). A companion star
 * is just another orbit slot in the same walk, not a separate layer bolted
 * on afterward -- an "epistellar" companion (very close in) can and should
 * end up packed among a star's own inner planets, not unconditionally
 * beyond all of them. A single-star system is simply the `companions: []`
 * case of this same function, not a different code path; a companion's own
 * nested call always passes `companions: []` in turn, since this repo's
 * model has no companion-of-a-companion nesting.
 */
export function buildSolarSystemOverlay(
	params: SolarSystemOverlayParams,
): SolarSystemOverlayState {
	const {
		bodies,
		companions,
		daysPerYear,
		spectralClass,
		starSubtype,
		hostStar,
		initialDay,
		showEllipticalOrbits,
		showDaylight,
		showInclination,
		showAxialTilt,
		showRealisticSizes,
		showBodyNames,
		showRealNames,
		namesEnabled,
		starName,
		mainWorldTexture,
	} = params

	const group = new THREE.Group()
	let currentDay = initialDay
	let currentSpinHours = 0

	// --- Star ---
	const renderSpectralClass = hostStar?.spectralClass ?? spectralClass
	const isBlackHole = renderSpectralClass === "BH"
	const isNeutronStar = renderSpectralClass === "NS"
	const isWhiteDwarf = renderSpectralClass === "D"
	const isBrownDwarf = ["L", "T", "Y"].includes(renderSpectralClass)
	const isGiant = STAR.isGiant(hostStar?.luminosityClass ?? "V")
	const rolledStarDiameterSol =
		hostStar?.diameterSol ??
		STAR.getStarDiameterSol({
			cls: renderSpectralClass as (typeof STAR.mainSequenceClasses)[number],
			subtype: starSubtype,
		})
	// Persisted profiles created before accretion disks represented BH diameter
	// contain only the tiny event horizon. Render those legacy BHs at the
	// mandatory disk scale as well.
	const starDiameterSol = isBlackHole
		? Math.max(rolledStarDiameterSol, 4.218 * (hostStar?.massSol ?? 1))
		: rolledStarDiameterSol
	const starDiameterKm = starDiameterSol * ORBIT_BODY.solarDiameterKm
	// Realistic mode uses the same shared floor/ceiling (and fixed
	// Earth-diameter reference) as every other body in the scene — see
	// scaleBodyDiameterToVisualRadius — so the star sits on the same absolute
	// scale instead of being sized relative to the (resizable) main world.
	// Non-realistic mode instead buckets by spectral class only, with no
	// sizeClass equivalent to hand it — see getNonRealisticStarToPlanetRatio.
	const starRadius = showRealisticSizes
		? scaleBodyDiameterToVisualRadius(
				starDiameterKm,
				PLANET_SCENE_RADIUS,
				true,
				0,
			)
		: isNeutronStar
			? PLANET_SCENE_RADIUS * 0.75
			: isWhiteDwarf
				? PLANET_SCENE_RADIUS * 0.6
				: isBrownDwarf
					? PLANET_SCENE_RADIUS *
						(renderSpectralClass === "L"
							? 1.15
							: renderSpectralClass === "T"
								? 0.9
								: 0.7)
					: PLANET_SCENE_RADIUS *
						(hostStar
							? Math.max(1, Math.sqrt(starDiameterSol) * 3) *
								(isBlackHole ? 1.75 : 1)
							: STAR.getNonRealisticStarToPlanetRatio({
									cls: renderSpectralClass as (typeof STAR.mainSequenceClasses)[number],
									subtype: starSubtype,
								}))
	const starColorHex = isGiant
		? uiPalette.giantStar
		: (STAR_COLOR_BY_CLASS[renderSpectralClass] ?? "#fff772")
	// Profiles created before active disks were made mandatory retain zero
	// luminosity in persisted sessions; render them as active immediately too.
	const blackHoleLuminositySol = hostStar?.luminositySol || 1
	const hasActiveAccretionDisk = isBlackHole
	const diskColorHex = isBlackHole ? "#ff9b54" : starColorHex
	const renderedStarColorHex = isNeutronStar ? "#dbeafe" : starColorHex
	const starColor = new THREE.Color(renderedStarColorHex)
	const brownDwarfTexturePath =
		renderSpectralClass === "L"
			? "/textures/celestial/generated/dwarfs/L.png"
			: renderSpectralClass === "T"
				? "/textures/celestial/generated/dwarfs/T.png"
				: "/textures/celestial/generated/dwarfs/Y.png"
	const whiteDwarfTexturePath = "/textures/celestial/generated/dwarfs/D.png"
	// A real photographic sun texture (NASA-derived, via Solar System Scope),
	// desaturated then tinted per spectral class — see loadGrayscaleSunTexture.
	const standardStarMaterial = new THREE.MeshBasicMaterial({
		color: isBlackHole
			? 0x000000
			: isBrownDwarf || isWhiteDwarf
				? 0xffffff
				: starColor,
		map: isBrownDwarf
			? loadBodyTexture(brownDwarfTexturePath)
			: isWhiteDwarf
				? loadBodyTexture(whiteDwarfTexturePath)
				: null,
	})
	const starMaterial = standardStarMaterial
	const surfaceTextureLoad =
		isBlackHole || isNeutronStar || isWhiteDwarf || isBrownDwarf
			? { cancel: (): void => undefined }
			: loadGrayscaleSunTexture((texture) => {
					standardStarMaterial.map = texture
					standardStarMaterial.needsUpdate = true
				})
	const starMesh = new THREE.Mesh(
		new THREE.SphereGeometry(
			isBlackHole
				? starRadius * 0.18
				: isNeutronStar
					? starRadius * 0.28
					: starRadius,
			48,
			32,
		),
		starMaterial,
	)
	// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
	// XY (Z-north) — without this the star renders "on its side" relative to
	// the planets' orbital plane. Same fix already applied to the gas-giant
	// mesh elsewhere in this renderer.
	starMesh.rotation.x = Math.PI / 2
	group.add(starMesh)
	if (isBlackHole) {
		// This is intentionally a visual approximation rather than a full
		// relativistic ray tracer: radial heat falloff, warped spiral turbulence,
		// and a brighter approaching side make the disk legible at map scale.
		const diskMaterial = new THREE.ShaderMaterial({
			uniforms: {
				diskRadius: { value: starRadius },
				intensity: {
					value: 0.75 + Math.min(0.25, Math.sqrt(blackHoleLuminositySol) / 12),
				},
			},
			vertexShader: `
				varying vec2 diskPosition;
				void main() {
					diskPosition = position.xy;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform float diskRadius;
				uniform float intensity;
				varying vec2 diskPosition;
				void main() {
					float radius = length(diskPosition) / diskRadius;
					float angle = atan(diskPosition.y, diskPosition.x);
					float heat = pow(1.0 - radius, 0.58);
					float spiral = 0.72 + 0.28 * sin(angle * 9.0 - radius * 68.0);
					float turbulence = 0.86 + 0.14 * sin(angle * 31.0 + radius * 113.0);
					float doppler = 0.66 + 0.34 * sin(angle);
					vec3 outer = vec3(0.45, 0.035, 0.005);
					vec3 middle = vec3(1.0, 0.16, 0.012);
					vec3 inner = vec3(1.0, 0.88, 0.55);
					vec3 color = mix(outer, middle, smoothstep(0.05, 0.62, heat));
					color = mix(color, inner, smoothstep(0.58, 1.0, heat));
					color *= spiral * turbulence * doppler * intensity;
					float alpha = smoothstep(1.0, 0.68, radius) * 0.94;
					gl_FragColor = vec4(color, alpha);
				}
			`,
			transparent: true,
			side: THREE.DoubleSide,
			depthWrite: false,
		})
		const disk = new THREE.Mesh(
			new THREE.RingGeometry(starRadius * 0.22, starRadius, 128),
			diskMaterial,
		)
		group.add(disk)
	}
	if (isNeutronStar) {
		const beamLength = starRadius * 5
		const beamMaterial = new THREE.MeshBasicMaterial({
			color: 0x60a5fa,
			transparent: true,
			opacity: 0.18,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide,
		})
		for (const direction of [-1, 1]) {
			const beam = new THREE.Mesh(
				new THREE.ConeGeometry(starRadius * 0.32, beamLength, 32, 1, true),
				beamMaterial,
			)
			beam.rotation.x = direction * Math.PI * 0.5
			beam.position.z = direction * beamLength * 0.5
			group.add(beam)
		}
	}

	const glowTexture = createStarGlowTexture(
		isBlackHole ? diskColorHex : renderedStarColorHex,
	)
	const glowSprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: glowTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	)
	glowSprite.scale.setScalar(
		starRadius * (isBlackHole ? 2 : isNeutronStar || isWhiteDwarf ? 5 : 3),
	)
	if ((!isBlackHole || hasActiveAccretionDisk) && !isBrownDwarf)
		group.add(glowSprite)
	else {
		glowTexture.dispose()
		glowSprite.material.dispose()
	}

	// decay=0 keeps the light's intensity constant regardless of a body's
	// orbital distance — with the physically-correct inverse-square falloff
	// (decay=2) the star was too dim at typical distances to cast any visible
	// day/night terminator.
	const starLight = new THREE.PointLight(
		isBlackHole ? diskColorHex : starColor,
		showDaylight
			? isBlackHole
				? hasActiveAccretionDisk
					? 1.2 + Math.min(2, Math.sqrt(blackHoleLuminositySol))
					: 0
				: isNeutronStar
					? 3.2
					: isWhiteDwarf
						? 2.8
						: isBrownDwarf
							? 0.5
							: 2.4
			: 0,
		0,
		0,
	)
	group.add(starLight)
	const systemAmbient = new THREE.AmbientLight(
		showDaylight ? 0x445566 : 0xffffff,
		showDaylight ? 0.15 : 2.6,
	)
	group.add(systemAmbient)

	let starNameLabel: Text | undefined
	let starNameLeader: THREE.Line | undefined
	if (showBodyNames) {
		starNameLabel = createNameLabel(
			showRealNames
				? "Sol"
				: namesEnabled && starName
					? starName
					: `${spectralClass}${Math.round(starSubtype)} Star`,
		)
		starNameLeader = createNameLeaderLine()
		sizeNameLabel(starNameLabel, starRadius)
		group.add(starNameLabel)
		group.add(starNameLeader)
	}

	// Per-group ordinal (1-indexed), matching GenerationPanel's own sibling
	// numbering, so a label like "Terrestrial Planet 2" here matches the same
	// body's title in the stat panel.
	const groupCounters: Record<SystemBody["group"], number> = {
		"asteroid belt": 0,
		dwarf: 0,
		terrestrial: 0,
		helian: 0,
		jovian: 0,
	}

	// --- Build every body (siblings + main world), each with its own nested
	// moon system, but don't position them yet — spacing depends on every
	// body's own size, computed below in orbital order. ---
	const placed: PlacedBody[] = bodies.map((body, index) => {
		const meanAnomalyAtEpoch = index * GOLDEN_ANGLE_RAD
		groupCounters[body.group] += 1
		if (body.group === "asteroid belt") {
			return {
				body,
				sceneRadius: BELT_SCENE_RADIUS,
				moonSystemOuterRadius: BELT_SCENE_RADIUS,
				isBelt: true,
				orbitRadius: 0,
				meanAnomalyAtEpoch,
			}
		}

		const sceneRadius = bodySceneRadius(
			body.diameterKm,
			body.sizeClass,
			showRealisticSizes,
		)
		const bodyGroup = new THREE.Group()
		const isGasGiant = body.group === "jovian"
		const texturePath = body.texturePath
		// The main world's own simulated terrain/vegetation, standing in for
		// its static texturePath image -- see mainWorldTexture's doc comment.
		const mainWorldSatelliteMap = body.isMainWorld ? mainWorldTexture : null
		const material = mainWorldSatelliteMap
			? new THREE.MeshStandardMaterial({
					map: mainWorldSatelliteMap,
					roughness: 1,
					metalness: 0,
				})
			: texturePath
				? new THREE.MeshStandardMaterial({
						map: loadBodyTexture(texturePath),
						roughness: 1,
						metalness: 0,
					})
				: isGasGiant
					? new THREE.MeshStandardMaterial({
							map: loadBodyTexture(
								"/textures/celestial/sol/jupiter/2k_jupiter.jpg",
							),
							roughness: 1,
							metalness: 0,
						})
					: new THREE.MeshStandardMaterial({
							color:
								(body.classification === "tectonic" ||
									body.classification === "vesperian") &&
								(body.hydrosphereCode ?? 0) >= 10
									? FULL_OCEAN_COLOR
									: (CLASSIFICATION_COLOR[body.classification] ??
										(body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR)),
							roughness: 0.9,
							metalness: 0,
						})
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), material)
		// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
		// XY (Z-north) — textured bodies need the same quarter-turn so their
		// maps don't render "on their side". Untextured rocky spheres looked
		// fine before because the solid-color material had no visible poles.
		if (isGasGiant || texturePath) mesh.rotation.x = Math.PI / 2
		mesh.scale.setScalar(sceneRadius)
		bodyGroup.add(mesh)
		let cloudsMesh: THREE.Mesh | undefined
		if (body.cloudsTexturePath) {
			const cloudsTexture = loadBodyTexture(body.cloudsTexturePath)
			// boostCloudAlphaMap below flips its V sample to match a texture
			// stored north-row-first (see cloud-material.ts); loadBodyTexture
			// doesn't set that (its other use -- the surface "map" texture --
			// is correct as-is with the browser's default flipY), so it must
			// be set here, per-instance, for the clouds path specifically.
			cloudsTexture.flipY = false
			const cloudsMaterial = new THREE.MeshStandardMaterial({
				color: 0xffffff,
				alphaMap: cloudsTexture,
				transparent: true,
				opacity: 1,
				alphaTest: 0.02,
				depthWrite: false,
				roughness: 1,
				metalness: 0,
			})
			boostCloudAlphaMap(cloudsMaterial)
			cloudsMesh = new THREE.Mesh(
				new THREE.SphereGeometry(1, 24, 18),
				cloudsMaterial,
			)
			cloudsMesh.rotation.x = Math.PI / 2
			cloudsMesh.scale.setScalar(sceneRadius * 1.025)
			cloudsMesh.renderOrder = 2
			bodyGroup.add(cloudsMesh)
		}
		let ringMesh: THREE.Mesh | undefined
		if (body.rings) {
			const ringGeometry = new THREE.RingGeometry(
				body.rings.innerRadiusRelative,
				body.rings.outerRadiusRelative,
				96,
				20,
			)
			const position = ringGeometry.getAttribute("position")
			const color = new THREE.Color(body.rings.color)
			const colors = new Float32Array(position.count * 3)
			for (let i = 0; i < position.count; i++) {
				const radius = Math.hypot(position.getX(i), position.getY(i))
				const normalized =
					(radius - body.rings.innerRadiusRelative) /
					Math.max(
						body.rings.outerRadiusRelative - body.rings.innerRadiusRelative,
						1e-6,
					)
				const envelope = 0.18 + Math.sin(normalized * Math.PI) * 0.82
				const broadBands =
					0.72 +
					0.18 * Math.sin(normalized * Math.PI * 5.5 + 0.4) +
					0.1 * Math.sin(normalized * Math.PI * 13.5 + 1.3)
				const fineBands = 0.9 + 0.08 * Math.sin(normalized * Math.PI * 36 + 2.1)
				const gapMask =
					(normalized > 0.34 && normalized < 0.39) ||
					(normalized > 0.73 && normalized < 0.755)
						? 0.18
						: 1
				const brightness = envelope * broadBands * fineBands * gapMask
				colors[i * 3] = Math.min(1, color.r * brightness)
				colors[i * 3 + 1] = Math.min(1, color.g * brightness)
				colors[i * 3 + 2] = Math.min(1, color.b * brightness)
			}
			ringGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
			const ringMaterial = new THREE.MeshBasicMaterial({
				vertexColors: true,
				transparent: true,
				opacity: body.rings.opacity,
				side: THREE.DoubleSide,
				depthWrite: false,
			})
			ringMesh = new THREE.Mesh(ringGeometry, ringMaterial)
			ringMesh.scale.setScalar(sceneRadius)
			bodyGroup.add(ringMesh)
		}

		const moonState = buildMoonOrbitOverlay(
			body.moons,
			body.diameterKm / 2,
			initialDay,
			false,
			15,
			showEllipticalOrbits,
			showInclination,
			body.rings?.outerRadiusRelative ?? 1,
			sceneRadius,
			showAxialTilt,
			showRealisticSizes,
			showBodyNames,
			showRealNames,
			body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
		)
		moonState.group.scale.setScalar(sceneRadius)
		bodyGroup.add(moonState.group)
		group.add(bodyGroup)

		const moonSystemOuterRadius = measureBodyMoonSystemOuterRadius(
			body,
			sceneRadius,
			showEllipticalOrbits,
			showRealisticSizes,
		)

		let nameLabel: Text | undefined
		let nameLeader: THREE.Line | undefined
		if (showBodyNames) {
			nameLabel = createNameLabel(
				bodyDisplayName(
					body,
					groupCounters[body.group],
					showRealNames,
					namesEnabled,
				),
			)
			nameLeader = createNameLeaderLine()
			sizeNameLabel(nameLabel, sceneRadius)
			bodyGroup.add(nameLabel)
			bodyGroup.add(nameLeader)
		}

		return {
			body,
			sceneRadius,
			moonSystemOuterRadius,
			isBelt: false,
			bodyGroup,
			mesh,
			cloudsMesh,
			ringMesh,
			meshRestQuaternion: mesh.quaternion.clone(),
			baseQuaternion: mesh.quaternion.clone(),
			moonState,
			nameLabel,
			nameLeader,
			orbitRadius: 0,
			meanAnomalyAtEpoch,
		}
	})

	// --- Build every companion star's own full nested overlay (recursive --
	// always with companions: [], since this repo's model has no
	// companion-of-a-companion nesting), mounted in a group that will be
	// repositioned every setDay() call. Not positioned yet -- like `placed`
	// above, spacing is resolved below in one combined distance-ordered
	// pass with the planets. ---
	const placedCompanions: PlacedCompanion[] = companions.map(
		(companion, index) => {
			const overlay = buildSolarSystemOverlay(companion.star)
			const mount = new THREE.Group()
			mount.add(overlay.group)
			group.add(mount)

			const orbitLine = new THREE.Line(
				new THREE.BufferGeometry(),
				new THREE.LineBasicMaterial({
					color: COMPANION_ORBIT_LINE_COLOR,
					transparent: true,
					opacity: 0.35,
					depthWrite: false,
				}),
			)
			orbitLine.renderOrder = 1
			group.add(orbitLine)

			return {
				mount,
				overlay,
				orbitalPeriodDays: companion.orbitalPeriodDays,
				eccentricity: companion.eccentricity,
				inclinationDeg: companion.inclinationDeg,
				orbitRadius: 0,
				kepler: {
					P: new THREE.Vector3(),
					Q: new THREE.Vector3(),
					a: 0,
					b: 0,
					ae: 0,
					e: 0,
				},
				orbitLine,
				meanAnomalyAtEpoch: index * GOLDEN_ANGLE_RAD,
			}
		},
	)

	// --- Combined distance ordering: bodies and companion stars are
	// different kinds of things to build, but the SAME kind of orbit slot --
	// interleaved by orbitalDistanceAU exactly like galaxy-gen's own
	// populateOrbitals sorts `[...companions, ...satellites]` by deviation
	// and walks that one list outward. Without this, a close-in "epistellar"
	// companion would unconditionally render beyond every one of this star's
	// own planets instead of interleaved among the inner ones, regardless of
	// its real (tiny) distance. ---
	type LayoutSlot =
		| { kind: "body"; placedIndex: number; orbitalDistanceAU: number }
		| { kind: "companion"; companionIndex: number; orbitalDistanceAU: number }
	const layoutSlots: LayoutSlot[] = [
		...placed.map((p, placedIndex) => ({
			kind: "body" as const,
			placedIndex,
			orbitalDistanceAU: p.body.orbitalDistanceAU,
		})),
		...placedCompanions.map((_c, companionIndex) => ({
			kind: "companion" as const,
			companionIndex,
			orbitalDistanceAU: companions[companionIndex]!.orbitalDistanceAU,
		})),
	].sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)

	// --- Orbit rings + asteroid belt rings ---
	function rebuildMoonState(p: PlacedBody) {
		if (p.isBelt || !p.bodyGroup) return
		if (p.moonState) {
			p.bodyGroup.remove(p.moonState.group)
			p.moonState.dispose()
		}
		p.moonState = buildMoonOrbitOverlay(
			p.body.moons,
			p.body.diameterKm / 2,
			currentDay,
			false,
			15,
			showEllipticalOrbits,
			showInclination,
			p.body.rings?.outerRadiusRelative ?? 1,
			p.sceneRadius,
			showAxialTilt,
			showRealisticSizes,
			showBodyNames,
			showRealNames,
			p.body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
		)
		p.moonState.group.scale.setScalar(p.sceneRadius)
		p.bodyGroup.add(p.moonState.group)
	}

	function rebuildAsteroidFieldForPlacedBody(p: PlacedBody) {
		if (!p.isBelt) return
		if (p.asteroidField) {
			group.remove(p.asteroidField.mesh)
			p.asteroidField.mesh.geometry.dispose()
			const material = p.asteroidField.mesh.material
			if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
			else material.dispose()
		}
		p.asteroidField = buildAsteroidField(p.orbitRadius, p.body.zone === "outer")
		group.add(p.asteroidField.mesh)
	}

	function updateOrbitLineGeometry(p: PlacedBody) {
		if (!p.orbitLine) return
		const orbitPoints: THREE.Vector3[] = []
		for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
			const a = (i / ORBIT_SEGMENTS) * TWO_PI
			orbitPoints.push(
				p.kepler
					? orbitPoint(
							a,
							p.kepler.a,
							p.kepler.b,
							p.kepler.ae,
							p.kepler.P,
							p.kepler.Q,
						)
					: new THREE.Vector3(
							p.orbitRadius * Math.cos(a),
							p.orbitRadius * Math.sin(a),
							0,
						),
			)
		}
		const nextGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints)
		p.orbitLine.geometry.dispose()
		p.orbitLine.geometry = nextGeometry
	}

	function updateCompanionOrbitLineGeometry(c: PlacedCompanion) {
		const orbitPoints: THREE.Vector3[] = []
		for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
			const a = (i / ORBIT_SEGMENTS) * TWO_PI
			orbitPoints.push(
				orbitPoint(
					a,
					c.kepler.a,
					c.kepler.b,
					c.kepler.ae,
					c.kepler.P,
					c.kepler.Q,
				),
			)
		}
		const nextGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints)
		c.orbitLine.geometry.dispose()
		c.orbitLine.geometry = nextGeometry
	}

	// Populated by applyPlacedBodyLayout, read by starLight's distance cutoff
	// below -- must be declared before that function's first call.
	let lastPlanetOuterEdge = starRadius

	// Walks layoutSlots (bodies AND companions, distance-ordered together)
	// once, threading one shared previousOuterEdge accumulator through both
	// kinds -- this is the single combined pack-by-size pass that replaces
	// what used to be two separate passes (all planets, then all companions
	// unconditionally beyond them).
	function applyPlacedBodyLayout() {
		let previousOuterEdge = starRadius
		// Tracks the outer edge of only THIS star's own planets/belts, ignoring
		// any companion-star slots interleaved into layoutSlots by distance --
		// see starLight.distance below, which must stop at this star's own
		// system instead of also reaching a companion's, unlike previousOuterEdge
		// (used for camera framing) which intentionally does include companions.
		lastPlanetOuterEdge = starRadius
		for (const slot of layoutSlots) {
			if (slot.kind === "companion") {
				const c = placedCompanions[slot.companionIndex]!
				// A companion's own suggestedCameraDistance is already sized to
				// frame its whole nested system (see buildSolarSystemOverlay's own
				// `suggestedCameraDistance = previousOuterEdge * 2.2`), so half of
				// it is a reasonable stand-in for "this companion's own outer
				// edge" -- same role p.moonSystemOuterRadius plays for a planet.
				const companionOuterRadius = c.overlay.suggestedCameraDistance / 2.2
				const gap =
					COMPANION_ORBIT_GAP_FACTOR *
					(previousOuterEdge + companionOuterRadius)
				const orbitRadius = previousOuterEdge + gap + companionOuterRadius
				c.orbitRadius = orbitRadius
				const e = showEllipticalOrbits ? c.eccentricity : 0
				const inc = (showInclination ? c.inclinationDeg : 0) * DEG2RAD
				const a = orbitRadius / (1 - e)
				const b = a * Math.sqrt(1 - e * e)
				const { P, Q } = perifocalBasis(0, inc, 0)
				c.kepler = { P, Q, a, b, ae: a * e, e }
				previousOuterEdge = a * (1 + e) + companionOuterRadius
				continue
			}

			const p = placed[slot.placedIndex]!
			p.sceneRadius = p.isBelt
				? BELT_SCENE_RADIUS
				: bodySceneRadius(
						p.body.diameterKm,
						p.body.sizeClass,
						showRealisticSizes,
					)
			p.moonSystemOuterRadius = p.isBelt
				? BELT_SCENE_RADIUS
				: measureBodyMoonSystemOuterRadius(
						p.body,
						p.sceneRadius,
						showEllipticalOrbits,
						showRealisticSizes,
					)
			const gap =
				ORBIT_GAP_STAR_RADII * Math.max(p.sceneRadius, starRadius * 0.05)
			const periapsis = previousOuterEdge + gap + p.moonSystemOuterRadius
			p.orbitRadius = periapsis

			if (p.isBelt) {
				p.kepler = undefined
				previousOuterEdge = periapsis + p.moonSystemOuterRadius
				lastPlanetOuterEdge = previousOuterEdge
				continue
			}

			p.mesh?.scale.setScalar(p.sceneRadius)
			p.cloudsMesh?.scale.setScalar(p.sceneRadius * 1.025)
			p.ringMesh?.scale.setScalar(p.sceneRadius)
			p.moonState?.group.scale.setScalar(p.sceneRadius)
			if (p.nameLabel) {
				sizeNameLabel(p.nameLabel, p.sceneRadius)
			}

			const e = showEllipticalOrbits ? p.body.eccentricity : 0
			const inc = (showInclination ? p.body.inclinationDeg : 0) * DEG2RAD
			const Omega = p.body.longitudeOfAscendingNodeDeg * DEG2RAD
			const omega =
				(p.body.longitudeOfPerihelionDeg - p.body.longitudeOfAscendingNodeDeg) *
				DEG2RAD
			const a = periapsis / (1 - e)
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(Omega, inc, omega)
			p.kepler = { P, Q, a, b, ae: a * e, e }
			previousOuterEdge = a * (1 + e) + p.moonSystemOuterRadius
			lastPlanetOuterEdge = previousOuterEdge

			if (p.mesh && p.meshRestQuaternion) {
				p.baseQuaternion = p.meshRestQuaternion.clone()
				p.mesh.quaternion.copy(p.baseQuaternion)
			}
			if (p.moonState) p.moonState.group.quaternion.identity()
			if (p.ringMesh) p.ringMesh.quaternion.identity()

			if (showAxialTilt && p.body.axialTiltDeg) {
				const { Q: tiltAxis } = perifocalBasis(Omega, inc, 0)
				const tiltRad = p.body.axialTiltDeg * DEG2RAD
				const tiltQuat = new THREE.Quaternion().setFromAxisAngle(
					tiltAxis,
					tiltRad,
				)
				if (p.mesh && p.baseQuaternion) {
					p.baseQuaternion = new THREE.Quaternion().multiplyQuaternions(
						tiltQuat,
						p.baseQuaternion,
					)
					p.mesh.quaternion.copy(p.baseQuaternion)
				}
				p.moonState?.group.quaternion.premultiply(tiltQuat)
				p.ringMesh?.quaternion.premultiply(tiltQuat)
			}
		}
		return previousOuterEdge
	}

	let previousOuterEdge = applyPlacedBodyLayout()
	// Capped to this star's own outer planet/belt only when there's an actual
	// companion star to protect against -- a lone star has nothing else in
	// the scene to bleed light onto, so leave it at the uncapped default
	// (distance 0 -- see starLight's own doc above) there. A cap is still an
	// approximation even with a companion (eccentric orbits can carry a body
	// past its nominal orbitRadius), so a real single-star system's
	// legitimately far-out planets must never be exposed to it at all, not
	// just given a generous margin -- capping unconditionally left an
	// extreme-outer-zone planet (e.g. ~130 AU packed radius) outside the cut
	// and rendered solid black despite having a perfectly good texture.
	starLight.distance =
		placedCompanions.length > 0 ? lastPlanetOuterEdge * 1.05 : 0
	// A body "hosts" the main world either directly (isMainWorld) or by
	// having it nested in its moons (gas-giant-moon mode) -- both get the
	// same highlighted orbit ring / camera-scale reference below.
	const hostsMainWorld = (p: PlacedBody) =>
		p.body.isMainWorld || p.body.moons.some((moon) => moon.isMainWorld)
	for (const p of placed) {
		const orbitPoints: THREE.Vector3[] = []
		for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
			const a = (i / ORBIT_SEGMENTS) * TWO_PI
			orbitPoints.push(
				p.kepler
					? orbitPoint(
							a,
							p.kepler.a,
							p.kepler.b,
							p.kepler.ae,
							p.kepler.P,
							p.kepler.Q,
						)
					: new THREE.Vector3(
							p.orbitRadius * Math.cos(a),
							p.orbitRadius * Math.sin(a),
							0,
						),
			)
		}
		const orbitLine = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(orbitPoints),
			new THREE.LineBasicMaterial({
				color: hostsMainWorld(p) ? 0x93c5fd : 0x94a3b8,
				transparent: true,
				opacity: hostsMainWorld(p) ? 0.75 : 0.5,
				depthWrite: false,
			}),
		)
		orbitLine.renderOrder = 1
		p.orbitLine = orbitLine
		group.add(orbitLine)

		if (p.isBelt) {
			group.add(
				new THREE.Mesh(
					new THREE.RingGeometry(
						p.orbitRadius - BELT_WIDTH / 2,
						p.orbitRadius + BELT_WIDTH / 2,
						128,
					),
					new THREE.MeshBasicMaterial({
						color: 0xb8b8b8,
						transparent: true,
						opacity: 0.25,
						side: THREE.DoubleSide,
					}),
				),
			)
			p.asteroidField = buildAsteroidField(p.orbitRadius, p.body.zone === "outer")
			group.add(p.asteroidField.mesh)
		}
	}
	for (const c of placedCompanions) updateCompanionOrbitLineGeometry(c)

	// Scene orbit radii are packed by rendered size, not real AU distance (see
	// ORBIT_GAP_STAR_RADII's comment), so deriving a body's period from its
	// scene radius via Kepler's law produced a period that only matched the
	// body's real orbitalPeriodDays for whichever body happened to anchor
	// mainOrbitRadius (Earth) -- every other body's visual orbit then
	// completed a different fraction of a lap than the "watch one orbit"
	// slider (which advances time using the real orbitalPeriodDays) expected.
	// Using each body's own real orbitalPeriodDays directly keeps the two in
	// sync for every body, not just the one anchor.
	function periodDaysFor(body: SystemBody): number {
		return Math.max(1, body.orbitalPeriodDays || daysPerYear)
	}

	const asteroidDummy = new THREE.Object3D()

	const bodySpinQuat = new THREE.Quaternion()
	const bodySpinAxis = new THREE.Vector3(0, 1, 0)
	// THREE.SphereGeometry's UV places u=0.5 (a texture's horizontal center)
	// at azimuthal phi=pi, which its position formula puts at local (+1, 0, 0)
	// on the equator -- i.e. the dayside axis RotY(0) leaves pointing is
	// local +X, not +Z. (A first attempt at this used +Z, which put every
	// locked body's dayside a constant 90 degrees off from the star.)
	const toStarWorld = new THREE.Vector3()
	const inverseBaseQuat = new THREE.Quaternion()
	/** For a body solar-tide-locked to its star, the mesh's dayside axis must
	 * continuously track the body's actual current direction to the star (set
	 * by setDay, via p.bodyGroup.position) as it moves along its orbit.
	 * Deliberately ignores body.substellarLon: that's a leftover per-body
	 * random tag from when locked bodies used generic, non-directional art
	 * (any snowball/rockball texture, spun to an arbitrary "which longitude
	 * faces the star" angle since it didn't matter). The vesperian/jani-lithic
	 * art these bodies actually get now is drawn with the dayside baked into
	 * the image's horizontal center -- there is no "which longitude" choice
	 * left to make, the center must always face the star, so applying
	 * substellarLon on top only rotated each body away from correct alignment
	 * by a different random amount (visibly inconsistent dayside-to-star
	 * facing from one locked planet to the next). */
	function solarLockedSpinAngle(p: PlacedBody): number | null {
		if (p.body.tideLock?.type !== "solar" || !p.bodyGroup || !p.baseQuaternion)
			return null
		// The star sits at this orbit's local focus (origin), same frame
		// p.bodyGroup.position is expressed in -- see setDay's orbitPoint call.
		toStarWorld.copy(p.bodyGroup.position).negate()
		inverseBaseQuat.copy(p.baseQuaternion).conjugate()
		toStarWorld.applyQuaternion(inverseBaseQuat)
		// RotY(theta) * (1,0,0) = (cos theta, 0, -sin theta) -- solve for the
		// theta that lands it on (toStarWorld.x, _, toStarWorld.z).
		return Math.atan2(-toStarWorld.z, toStarWorld.x)
	}

	function setDay(day: number) {
		currentDay = day
		for (const p of placed) {
			if (p.isBelt) {
				if (p.asteroidField) {
					updateAsteroidField(
						p.asteroidField,
						asteroidDummy,
						day,
						periodDaysFor(p.body),
					)
				}
				continue
			}
			if (!p.bodyGroup || !p.kepler) continue
			const period = periodDaysFor(p.body)
			const M = mod2pi(p.meanAnomalyAtEpoch + (TWO_PI * day) / period)
			const E = solveKepler(M, p.kepler.e)
			const pos = orbitPoint(
				E,
				p.kepler.a,
				p.kepler.b,
				p.kepler.ae,
				p.kepler.P,
				p.kepler.Q,
			)
			p.bodyGroup.position.copy(pos)
			p.moonState?.setDay(day)
		}
		for (const c of placedCompanions) {
			const period = Math.max(1, c.orbitalPeriodDays)
			const angle = mod2pi(c.meanAnomalyAtEpoch + (TWO_PI * day) / period)
			c.mount.position.copy(
				orbitPoint(
					solveKepler(angle, c.kepler.e),
					c.kepler.a,
					c.kepler.b,
					c.kepler.ae,
					c.kepler.P,
					c.kepler.Q,
				),
			)
			c.overlay.setDay(day)
		}
		// A solar-locked body's facing depends on its just-updated orbital
		// position (solarLockedSpinAngle), not on currentSpinHours -- refresh it
		// here too so a date-only change (no hour-slider interaction) doesn't
		// leave it stale.
		setSpinHours(currentSpinHours)
	}
	setDay(initialDay)

	function dispose() {
		surfaceTextureLoad.cancel()
		for (const p of placed) p.moonState?.dispose()
		for (const c of placedCompanions) c.overlay.dispose()
		// troika Text's own dispose() releases its SDF glyph atlas/font
		// ref-count too — the generic Mesh handling below only disposes the
		// geometry/material, which isn't enough for it.
		starNameLabel?.dispose()
		for (const p of placed) p.nameLabel?.dispose()
		for (const c of placedCompanions) {
			c.orbitLine.geometry.dispose()
			;(c.orbitLine.material as THREE.Material).dispose()
		}
		group.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry.dispose()
				const materials = Array.isArray(obj.material)
					? obj.material
					: [obj.material]
				for (const m of materials) {
					if (
						m instanceof THREE.MeshBasicMaterial ||
						m instanceof THREE.MeshStandardMaterial
					)
						if (
							m.map &&
							!(
								"sharedTexture" in m.map.userData &&
								m.map.userData.sharedTexture
							)
						)
							m.map.dispose()
					m.dispose()
				}
			} else if (obj instanceof THREE.Sprite) {
				if (
					obj.material.map &&
					!(
						"sharedTexture" in obj.material.map.userData &&
						obj.material.map.userData.sharedTexture
					)
				)
					obj.material.map.dispose()
				obj.material.dispose()
			}
		})
		group.clear()
	}

	const suggestedCameraDistance = previousOuterEdge * 2.2

	function updateLabelOrientations(camera: THREE.PerspectiveCamera): void {
		if (starNameLabel && starNameLeader) {
			updateLabelPlacement(
				starNameLabel,
				starNameLeader,
				starRadius,
				IDENTITY_QUATERNION,
				camera,
			)
		}
		for (const p of placed) {
			if (p.nameLabel && p.nameLeader) {
				updateLabelPlacement(
					p.nameLabel,
					p.nameLeader,
					p.sceneRadius,
					IDENTITY_QUATERNION,
					camera,
				)
			}
			p.moonState?.updateLabelOrientations?.(camera)
		}
		for (const c of placedCompanions) c.overlay.updateLabelOrientations(camera)
	}

	function getBodyFocus(
		address: OrbitAddress,
	): { position: THREE.Vector3; radius: number } | null {
		if (address.starIndex > 0) {
			const c = placedCompanions[address.starIndex - 1]
			if (!c) return null
			const focus = c.overlay.getBodyFocus({ ...address, starIndex: 0 })
			if (!focus) return null
			return {
				position: focus.position.clone().add(c.mount.position),
				radius: focus.radius,
			}
		}
		if (address.kind === "star") {
			return { position: new THREE.Vector3(0, 0, 0), radius: starRadius }
		}
		const p = placed[address.bodyIdx]
		if (!p) return null
		if (address.kind === "moon" && p.moonState?.getMoonFocus) {
			const moonFocus = p.moonState.getMoonFocus(address.moonIdx)
			if (moonFocus) {
				return {
					position: moonFocus.position,
					radius: Math.max(moonFocus.localRadius * p.sceneRadius, 0.01),
				}
			}
		}
		if (p.isBelt) {
			return {
				position: new THREE.Vector3(p.orbitRadius, 0, 0),
				radius: BELT_WIDTH,
			}
		}
		if (!p.bodyGroup) return null
		return {
			position: p.bodyGroup.position.clone(),
			radius: Math.max(p.sceneRadius, p.moonSystemOuterRadius * 0.5),
		}
	}

	function setSpinHours(hours: number) {
		currentSpinHours = hours
		for (const p of placed) {
			if (
				!p.isBelt &&
				p.mesh &&
				p.baseQuaternion &&
				p.body.siderealDayHours > 0
			) {
				const lockedAngle = solarLockedSpinAngle(p)
				const angle =
					lockedAngle ?? (hours / p.body.siderealDayHours) * TWO_PI
				bodySpinQuat.setFromAxisAngle(bodySpinAxis, angle)
				p.mesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				if (p.cloudsMesh) {
					// Clouds drift slightly faster than the surface -- real
					// atmospheric circulation outpaces solid-body rotation. A
					// locked body's own rotation is fixed to its orbital position
					// rather than hours, so drift it by hours directly instead.
					const cloudsAngle =
						lockedAngle !== null
							? lockedAngle + (hours / p.body.siderealDayHours) * TWO_PI * 0.1
							: angle * 1.1
					bodySpinQuat.setFromAxisAngle(bodySpinAxis, cloudsAngle)
					p.cloudsMesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				}
			}
			p.moonState?.setSpinHours?.(hours)
		}
		for (const c of placedCompanions) c.overlay.setSpinHours(hours)
	}

	function resolveHitBodyIndex(object: THREE.Object3D): OrbitAddress | null {
		if (object === starMesh) return { kind: "star", starIndex: 0 }
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			if (
				p.mesh === object ||
				p.cloudsMesh === object ||
				p.ringMesh === object
			) {
				return { kind: "body", starIndex: 0, bodyIdx: i }
			}
			const moonIndex = p.moonState?.getMoonIndexForMesh?.(object)
			if (moonIndex != null)
				return { kind: "moon", starIndex: 0, bodyIdx: i, moonIdx: moonIndex }
		}
		for (let i = 0; i < placedCompanions.length; i++) {
			const hit = placedCompanions[i]!.overlay.resolveHitBodyIndex(object)
			if (hit) return { ...hit, starIndex: i + 1 }
		}
		return null
	}

	function listAddresses(): OrbitAddress[] {
		const addresses: OrbitAddress[] = [{ kind: "star", starIndex: 0 }]
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			addresses.push({ kind: "body", starIndex: 0, bodyIdx: i })
			for (let m = 0; m < p.body.moons.length; m++) {
				addresses.push({ kind: "moon", starIndex: 0, bodyIdx: i, moonIdx: m })
			}
		}
		for (let i = 0; i < placedCompanions.length; i++) {
			const nested = placedCompanions[i]!.overlay.listAddresses()
			for (const address of nested) {
				addresses.push({ ...address, starIndex: i + 1 })
			}
		}
		return addresses
	}

	function updateBodies(
		nextBodies: SystemBody[],
		nextMainWorldTexture?: THREE.DataTexture | null,
	) {
		if (nextBodies.length !== placed.length) return false
		if ((nextMainWorldTexture ?? null) !== (mainWorldTexture ?? null))
			return false

		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			const nextBody = nextBodies[i]!
			if (p.body.group !== nextBody.group) return false
			if (!!p.body.rings !== !!nextBody.rings) return false
			if (p.body.texturePath !== nextBody.texturePath) return false
			if (p.body.cloudsTexturePath !== nextBody.cloudsTexturePath) return false
			p.body = nextBody
			if (!p.isBelt) rebuildMoonState(p)
		}

		previousOuterEdge = applyPlacedBodyLayout()
		starLight.distance =
			placedCompanions.length > 0 ? lastPlanetOuterEdge * 1.05 : 0
		for (const p of placed) {
			updateOrbitLineGeometry(p)
			if (p.isBelt) rebuildAsteroidFieldForPlacedBody(p)
		}
		for (const c of placedCompanions) updateCompanionOrbitLineGeometry(c)
		setDay(currentDay)
		setSpinHours(currentSpinHours)
		return true
	}

	return {
		group,
		suggestedCameraDistance,
		setDay,
		updateBodies,
		dispose,
		getBodyFocus,
		setSpinHours,
		resolveHitBodyIndex,
		listAddresses,
		updateLabelOrientations,
	}
}
