import * as THREE from "three"
import type { Text } from "troika-three-text"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { SystemBody } from "@/model/celestial/system/types"
import { scaleBodyDiameterToVisualRadius } from "@/ui/planet/moon-visual-scale"
import {
	createNameLabel,
	createNameLeaderLine,
	IDENTITY_QUATERNION,
	sizeNameLabel,
	updateLabelPlacement,
} from "@/ui/planet/renderer/body-name-label"
import { boostCloudAlphaMap } from "@/ui/planet/renderer/cloud-material"
import {
	buildMoonOrbitOverlay,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "@/ui/planet/renderer/moon-orbit-overlay"
import {
	buildAsteroidField,
	updateAsteroidField,
} from "@/ui/planet/renderer/solar-system-overlay/asteroid-field"
import {
	BELT_SCENE_RADIUS,
	BELT_WIDTH,
	CLASSIFICATION_COLOR,
	DEG2RAD,
	GOLDEN_ANGLE_RAD,
	MAIN_WORLD_COLOR,
	ORBIT_GAP_STAR_RADII,
	ORBIT_SEGMENTS,
	PLANET_SCENE_RADIUS,
	ROCKY_SIBLING_COLOR,
	STAR_COLOR_BY_CLASS,
	TWO_PI,
} from "@/ui/planet/renderer/solar-system-overlay/constants"
import {
	bodyDisplayName,
	bodySceneRadius,
	measureBodyMoonSystemOuterRadius,
} from "@/ui/planet/renderer/solar-system-overlay/helpers"
import {
	createStarGlowTexture,
	loadBodyTexture,
	loadGrayscaleSunTexture,
} from "@/ui/planet/renderer/solar-system-overlay/textures"
import type {
	PlacedBody,
	SolarSystemOverlayParams,
	SolarSystemOverlayState,
} from "@/ui/planet/renderer/solar-system-overlay/types"

export function buildSolarSystemOverlay(
	params: SolarSystemOverlayParams,
): SolarSystemOverlayState {
	const {
		bodies,
		daysPerYear,
		spectralClass,
		starSubtype,
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
	} = params

	const group = new THREE.Group()
	let currentDay = initialDay
	let currentSpinHours = 0

	// --- Star ---
	const starDiameterSol = STAR.getStarDiameterSol({
		cls: spectralClass,
		subtype: starSubtype,
	})
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
		: PLANET_SCENE_RADIUS *
			STAR.getNonRealisticStarToPlanetRatio({
				cls: spectralClass,
				subtype: starSubtype,
			})
	const starColorHex = STAR_COLOR_BY_CLASS[spectralClass] ?? "#fff772"
	const starColor = new THREE.Color(starColorHex)
	// A real photographic sun texture (NASA-derived, via Solar System Scope),
	// desaturated then tinted per spectral class — see loadGrayscaleSunTexture.
	const starMaterial = new THREE.MeshBasicMaterial({ color: starColor })
	const surfaceTextureLoad = loadGrayscaleSunTexture((texture) => {
		starMaterial.map = texture
		starMaterial.needsUpdate = true
	})
	const starMesh = new THREE.Mesh(
		new THREE.SphereGeometry(starRadius, 48, 32),
		starMaterial,
	)
	// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
	// XY (Z-north) — without this the star renders "on its side" relative to
	// the planets' orbital plane. Same fix already applied to the gas-giant
	// mesh elsewhere in this renderer.
	starMesh.rotation.x = Math.PI / 2
	group.add(starMesh)

	const glowTexture = createStarGlowTexture(starColorHex)
	const glowSprite = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: glowTexture,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	)
	glowSprite.scale.setScalar(starRadius * 3)
	group.add(glowSprite)

	// decay=0 keeps the light's intensity constant regardless of a body's
	// orbital distance — with the physically-correct inverse-square falloff
	// (decay=2) the star was too dim at typical distances to cast any visible
	// day/night terminator.
	const starLight = new THREE.PointLight(
		starColor,
		showDaylight ? 2.4 : 0,
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
					: `${STAR.getStarLabel({ cls: spectralClass, subtype: starSubtype })} Star`,
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
		const material = texturePath
			? new THREE.MeshStandardMaterial({
					map: loadBodyTexture(texturePath),
					roughness: 1,
					metalness: 0,
				})
			: isGasGiant
				? new THREE.MeshStandardMaterial({
						map: loadBodyTexture("/textures/celestial/sol/jupiter/2k_jupiter.jpg"),
						roughness: 1,
						metalness: 0,
					})
				: new THREE.MeshStandardMaterial({
						color:
							CLASSIFICATION_COLOR[body.classification] ??
							(body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR),
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
		p.asteroidField = buildAsteroidField(p.orbitRadius)
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

	function applyPlacedBodyLayout() {
		let previousOuterEdge = starRadius
		for (const p of placed) {
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
				(p.body.longitudeOfPerihelionDeg -
					p.body.longitudeOfAscendingNodeDeg) *
				DEG2RAD
			const a = periapsis / (1 - e)
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(Omega, inc, omega)
			p.kepler = { P, Q, a, b, ae: a * e, e }
			previousOuterEdge = a * (1 + e) + p.moonSystemOuterRadius

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
	let mainOrbitRadius =
		placed.find((p) => p.body.isMainWorld)?.kepler?.a ??
		placed[0]?.kepler?.a ??
		placed[0]?.orbitRadius ??
		1
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
				color: p.body.isMainWorld ? 0x93c5fd : 0x94a3b8,
				transparent: true,
				opacity: p.body.isMainWorld ? 0.75 : 0.5,
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
			p.asteroidField = buildAsteroidField(p.orbitRadius)
			group.add(p.asteroidField.mesh)
		}
	}

	// Kepler-like scaling (period grows with orbit radius^1.5), anchored to
	// the main world's real orbital period so its motion stays accurate.
	function periodDaysFor(orbitRadius: number): number {
		if (mainOrbitRadius <= 0) return Math.max(1, daysPerYear)
		return Math.max(1, daysPerYear * (orbitRadius / mainOrbitRadius) ** 1.5)
	}

	const asteroidDummy = new THREE.Object3D()

	function setDay(day: number) {
		currentDay = day
		for (const p of placed) {
			if (p.isBelt) {
				if (p.asteroidField) {
					updateAsteroidField(
						p.asteroidField,
						asteroidDummy,
						day,
						periodDaysFor(p.orbitRadius),
					)
				}
				continue
			}
			if (!p.bodyGroup || !p.kepler) continue
			const period = periodDaysFor(p.kepler.a)
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
	}
	setDay(initialDay)

	function dispose() {
		surfaceTextureLoad.cancel()
		for (const p of placed) p.moonState?.dispose()
		// troika Text's own dispose() releases its SDF glyph atlas/font
		// ref-count too — the generic Mesh handling below only disposes the
		// geometry/material, which isn't enough for it.
		starNameLabel?.dispose()
		for (const p of placed) p.nameLabel?.dispose()
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
	}

	function getBodyFocus(
		bodyIndex: number,
		moonIndex?: number,
	): { position: THREE.Vector3; radius: number } | null {
		if (bodyIndex === -1) {
			return { position: new THREE.Vector3(0, 0, 0), radius: starRadius }
		}
		const p = placed[bodyIndex]
		if (!p) return null
		if (moonIndex !== undefined && p.moonState?.getMoonFocus) {
			const moonFocus = p.moonState.getMoonFocus(moonIndex)
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

	const bodySpinQuat = new THREE.Quaternion()
	const bodySpinAxis = new THREE.Vector3(0, 1, 0)
	function setSpinHours(hours: number) {
		currentSpinHours = hours
		for (const p of placed) {
			if (
				!p.isBelt &&
				p.mesh &&
				p.baseQuaternion &&
				p.body.siderealDayHours > 0
			) {
				const lockedSubstellarLon =
					p.body.tideLock?.type === "solar" ? (p.body.substellarLon ?? 0) : null
				const angle =
					lockedSubstellarLon !== null
						? -(lockedSubstellarLon * DEG2RAD)
						: (hours / p.body.siderealDayHours) * TWO_PI
				bodySpinQuat.setFromAxisAngle(bodySpinAxis, angle)
				p.mesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				if (p.cloudsMesh) {
					// Clouds drift slightly faster than the surface -- real
					// atmospheric circulation outpaces solid-body rotation.
					bodySpinQuat.setFromAxisAngle(bodySpinAxis, angle * 1.1)
					p.cloudsMesh.quaternion.copy(p.baseQuaternion).multiply(bodySpinQuat)
				}
			}
			p.moonState?.setSpinHours?.(hours)
		}
	}

	function resolveHitBodyIndex(
		object: THREE.Object3D,
	): { bodyIndex: number; moonIndex?: number } | null {
		if (object === starMesh) return { bodyIndex: -1 }
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			if (p.mesh === object || p.ringMesh === object) {
				return { bodyIndex: i }
			}
			const moonIndex = p.moonState?.getMoonIndexForMesh?.(object)
			if (moonIndex != null) return { bodyIndex: i, moonIndex }
		}
		return null
	}

	function updateBodies(nextBodies: SystemBody[]) {
		if (nextBodies.length !== placed.length) return false

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
		mainOrbitRadius =
			placed.find((p) => p.body.isMainWorld)?.kepler?.a ??
			placed[0]?.kepler?.a ??
			placed[0]?.orbitRadius ??
			1
		for (const p of placed) {
			updateOrbitLineGeometry(p)
			if (p.isBelt) rebuildAsteroidFieldForPlacedBody(p)
		}
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
		updateLabelOrientations,
	}
}
