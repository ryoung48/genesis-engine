import * as THREE from "three"
import type { Text } from "troika-three-text"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { SystemBody } from "@/model/celestial/system/types"
import { uiPalette } from "@/ui/components/tokens"
import { buildBodyAtmosphereShell } from "@/ui/genesis/renderer/atmosphere-shell"
import {
	createNameLabel,
	createNameLeaderLine,
	IDENTITY_QUATERNION,
	sizeNameLabel,
	updateLabelPlacement,
} from "@/ui/genesis/renderer/body-name-label"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"
import { boostCloudAlphaMap } from "@/ui/genesis/renderer/cloud-material"
import {
	buildMoonOrbitOverlay,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "@/ui/genesis/renderer/moon-orbit-overlay"
import {
	buildStarSurfaceLayers,
	STAR_GLOW_RADIUS_SCALE,
} from "@/ui/genesis/renderer/star-surface-material"
import type { CloudBandPalette } from "@/ui/genesis/renderer/types"
import { scaleBodyDiameterToVisualRadius } from "@/ui/genesis/shared/moon-visual-scale"
import {
	buildAsteroidField,
	updateAsteroidField,
} from "@/ui/genesis/solar-system/overlay/asteroid-field"
import {
	BELT_SCENE_RADIUS,
	BELT_WIDTH_MIN,
	BELT_WIDTH_RATIO,
	BODY_LOD_SEGMENTS,
	BODY_LOD_THRESHOLDS,
	CLASSIFICATION_COLOR,
	DEG2RAD,
	FULL_OCEAN_COLOR,
	GOLDEN_ANGLE_RAD,
	MAIN_WORLD_COLOR,
	ORBIT_GAP_STAR_RADII,
	ORBIT_LINE_COLOR_BY_ZONE,
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

// One shared unit sphere per tessellation tier, reused by every body mesh
// (and cloud shell) currently at that tier -- see BODY_LOD_SEGMENTS. Kept at
// module scope, and flagged so an overlay's own dispose() traversal leaves
// them alone, exactly like the shared body textures.
const sharedBodyGeometries: THREE.SphereGeometry[] = []

function bodyGeometryForTier(tier: number): THREE.SphereGeometry {
	const existing = sharedBodyGeometries[tier]
	if (existing) return existing
	const segments = BODY_LOD_SEGMENTS[tier]!
	const geometry = new THREE.SphereGeometry(1, segments.width, segments.height)
	geometry.userData.sharedGeometry = true
	sharedBodyGeometries[tier] = geometry
	return geometry
}

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
		proceduralSystem,
		isCompanion,
	} = params
	// A companion's own recursive build always passes companions: [], so it
	// can't see its sibling primary star that way -- isCompanion carries it.
	const hasSiblingStar = companions.length > 0 || isCompanion === true

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
	// An ordinary star renders as a live photosphere: domain-warped fbm
	// granulation plus its own corona shell (see star-surface-material.ts),
	// which is why it needs no surface texture at all. The exotic remnants and
	// brown dwarfs below aren't photospheres in any meaningful sense and keep
	// their own flat textured/tinted materials and the sprite halo.
	const hasPhotosphere =
		!isBlackHole && !isNeutronStar && !isWhiteDwarf && !isBrownDwarf
	const starSurfaceLayers = hasPhotosphere
		? buildStarSurfaceLayers({
				spectralClass: renderSpectralClass,
				isGiant,
				tint: starColor,
				diameterSol: starDiameterSol,
			})
		: null
	const starMaterial: THREE.Material =
		starSurfaceLayers?.surface ??
		new THREE.MeshBasicMaterial({
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
	if (starSurfaceLayers) {
		// A unit sphere scaled to the star, so the corona tracks it if
		// starRadius is ever recomputed.
		const coronaMesh = new THREE.Mesh(
			new THREE.SphereGeometry(1, 48, 32),
			starSurfaceLayers.glow,
		)
		coronaMesh.scale.setScalar(starRadius * STAR_GLOW_RADIUS_SCALE)
		// Decorative: a raycast hit here must not resolve to the star, or it
		// would swallow clicks aimed at anything behind the corona.
		coronaMesh.raycast = () => {
			// Intentionally inert -- see doc above.
		}
		group.add(coronaMesh)
	}
	let blackHoleDiskMaterial: THREE.ShaderMaterial | null = null
	let blackHoleMesh: THREE.Mesh | null = null
	const HOLE_RADIUS = 0.3
	if (isBlackHole) {
		group.remove(starMesh)
		starMesh.geometry.dispose()
		starMaterial.dispose()
		// Port of a volumetric-raymarch black hole shader (Shadertoy-style: a
		// fixed 200-step march accumulating gravitational lensing + a glowing
		// disc, rather than a single sphere/disc-plane intersection test).
		// `bh` in the source shader is always the local origin -- centre/
		// objectScale (from the vertex shader) convert the true camera ray
		// into that local unit-sphere space so the same march applies however
		// this mesh is scaled/positioned in the scene.
		//
		// This mesh renders ONLY the glow/disc, additively, with no background
		// sampling at all -- there's a separate plain black opaque sphere
		// (below) for the actual event-horizon shadow. An earlier version
		// tried to recomposite a captured copy of the background wherever the
		// march contributed nothing, which needed the resampled copy's
		// resolution/color-space to exactly match the real scene; any mismatch
		// (and a raw ShaderMaterial skips Three's automatic output color-space
		// encoding entirely) showed up as a tinted circle at the mesh's own
		// silhouette. Additive blending with zero contribution is just zero --
		// nothing to mismatch, so the real scene shows through untouched.
		const discNoiseTexture = loadBodyTexture(
			"/textures/celestial/black-hole/disc-noise.png",
		)
		// The source shader's iChannel1: a small tileable noise texture,
		// sampled with wraparound as the disc spins past the seam.
		discNoiseTexture.wrapS = THREE.RepeatWrapping
		discNoiseTexture.wrapT = THREE.RepeatWrapping
		blackHoleDiskMaterial = new THREE.ShaderMaterial({
			uniforms: {
				discTexture: { value: discNoiseTexture },
				holeRadius: { value: HOLE_RADIUS },
				holeMass: { value: 5 },
				innerColor: { value: new THREE.Color(0xffccb3) },
				outerColor: { value: new THREE.Color(diskColorHex) },
				time: { value: 0 },
			},
			vertexShader: `
				varying vec3 fragPosWs;
				varying vec3 localPosition;
				void main() {
					vec4 worldPosition = modelMatrix * vec4(position, 1.0);
					fragPosWs = worldPosition.xyz;
					// The geometry is a UNIT sphere (radius 1, world size comes from
					// mesh.scale) -- its raw object-space position IS the black
					// hole's local frame ("bh" at the origin, event horizon well
					// inside radius 1), no arithmetic required. Deriving this same
					// point in the fragment shader instead, as
					// (cameraWorldPos - centre) / scale, produced a value whose
					// magnitude grows with camera distance; subtracting the march's
					// small step offsets from that then hit catastrophic
					// floating-point cancellation -- the concentric moire/banding
					// rings seen at most zoom levels.
					localPosition = position;
					gl_Position = projectionMatrix * viewMatrix * worldPosition;
				}
			`,
			fragmentShader: `
				// cameraPosition below is Three.js's own built-in uniform --
				// ShaderMaterial (unlike RawShaderMaterial) auto-declares and
				// updates it every frame, so it must NOT be redeclared here.
				uniform sampler2D discTexture;
				uniform float holeRadius;
				uniform float holeMass;
				uniform vec3 innerColor;
				uniform vec3 outerColor;
				uniform float time;
				varying vec3 fragPosWs;
				varying vec3 localPosition;

				float hash13(vec3 p) {
					p = fract(p * vec3(0.16532, 0.17369, 0.15787));
					p += dot(p.xyz, p.yzx + 19.19);
					return fract(p.x * p.y * p.z);
				}
				float sdSphere(vec3 p, float s) { return length(p) - s; }
				float sdTorus(vec3 p, vec2 t) {
					vec2 q = vec2(length(p.xz) - t.x, p.y);
					return length(q) - t.y;
				}
				void main() {
					vec3 rayDirWs = normalize(fragPosWs - cameraPosition);
					// localPosition (the mesh's own unit-sphere object-space
					// position, radius <= 1) is already the black hole's local
					// frame ("bh" at the origin) -- well-conditioned regardless of
					// camera distance, unlike deriving it from the camera position.
					vec3 ro = localPosition;
					vec3 rd = rayDirWs;

					vec3 bhMass = vec3(holeMass * 0.001);
					// The march only ever covers 200*dt = 4 local units total.
					// Jump straight to a point just before the ray's closest
					// approach to the hole (skipping the empty vacuum in between,
					// where gravity is negligible anyway) so a grazing ray that
					// enters the mesh far from the hole still gets there in time.
					float tClosest = dot(-ro, rd);
					vec3 p = ro + rd * max(0.0, tClosest - 4.0);
					vec3 pv = rd;
					p += pv * hash13(rd + vec3(time)) * 0.02;

					float dt = 0.02;
					vec3 col = vec3(0.0);
					float noncaptured = 1.0;

					// The march is otherwise unconditional (200 iterations for every
					// pixel the mesh covers, however far the ray passes from the
					// hole) -- fine for a small Shadertoy preview, but on a
					// screen-filling mesh in a real scene that's enough per-pixel
					// work to trip a GPU driver's hang detection and take down the
					// whole WebGL context. Skip the march for rays that never come
					// near the hole/disc, and bail out early once a ray has clearly
					// escaped -- both are no-ops for the rays that actually matter.
					float closestApproach = length(ro - rd * dot(ro, rd));
					if (closestApproach < 4.0) {
						for (int i = 0; i < 200; i++) {
							p += pv * dt * noncaptured;

							vec3 bhv = -p;
							float r = dot(bhv, bhv);
							pv += normalize(bhv) * (bhMass.x / r);

							noncaptured = smoothstep(0.0, 0.01, sdSphere(p, holeRadius));

							float dr = length(bhv.xz);
							float da = atan(bhv.x, bhv.z);
							vec2 ra = vec2(dr, da * (0.01 + (dr - holeRadius) * 0.002) + 2.0 * 3.14159265 + time * 0.02);
							ra *= vec2(10.0, 20.0);

							vec3 dcol = mix(innerColor, outerColor, pow(length(bhv) - holeRadius, 2.0))
								* max(0.0, texture2D(discTexture, ra * vec2(0.1, 0.5)).r + 0.05)
								* (4.0 / (0.001 + (length(bhv) - holeRadius) * 50.0));

							col += max(vec3(0.0), dcol * step(0.0, -sdTorus((p * vec3(1.0, 50.0, 1.0)), vec2(0.8, 0.99))) * noncaptured);
							// Ambient point-glow, gated only by noncaptured in the
							// source shader -- fine there (a full open 3D scene
							// where a grazing ray's bhv grows large quickly), but
							// here every ray is pre-jumped to start near its
							// closest approach (see tClosest above, added to fix
							// a separate zoom/precision bug), so bhv stays small
							// for most of the march on almost every pixel of the
							// mesh, not just ones actually near the hole. Summed
							// over ~200 steps that reads as a near-uniform dull
							// wash across the whole sphere. An explicit falloff
							// confines it to actually being near the hole/disc.
							float glowFalloff = smoothstep(holeRadius * 3.0, holeRadius, length(bhv));
							col += vec3(1.0, 0.9, 0.7) * (1.0 / vec3(dot(bhv, bhv))) * 0.003 * noncaptured * glowFalloff;

							if (noncaptured > 0.5 && length(p) > 4.0) break;
						}
					}

					// Additive: zero contribution here is genuinely zero, so the
					// real scene (whatever's actually behind this mesh) shows
					// through untouched -- no captured/resampled background to
					// mismatch resolution or color-space with.
					gl_FragColor = vec4(col, 1.0);
				}
			`,
			transparent: true,
			blending: THREE.AdditiveBlending,
			side: THREE.FrontSide,
			depthWrite: false,
			depthTest: true,
		})
		// See body meshes elsewhere in this file: a unit-radius geometry
		// scaled via mesh.scale keeps objectScale (read by the shader above)
		// equal to the mesh's real world-space radius.
		// The accretion disc's own torus (major/minor radius 0.8/0.99 in the
		// shader's local units, below) reaches out to about 1.8 -- a bounding
		// radius of 1 clips it flat exactly at the mesh's silhouette instead
		// of letting it taper off. mesh.scale (not this geometry radius) is
		// what ties local units to starRadius, so bounding the mesh bigger
		// only changes which pixels get shaded, not the disc's actual size.
		const BLACK_HOLE_BOUNDS_RADIUS = 2
		blackHoleMesh = new THREE.Mesh(
			new THREE.SphereGeometry(BLACK_HOLE_BOUNDS_RADIUS, 48, 32),
			blackHoleDiskMaterial,
		)
		blackHoleMesh.scale.setScalar(starRadius)
		// The actual event-horizon shadow: a plain opaque black sphere, sized
		// to the shader's own holeRadius (in the same unit-sphere local
		// space). A flat MeshBasicMaterial can't produce a tint/seam bug --
		// there's no resampling or color-space step for it to get wrong.
		const blackHoleShadowMesh = new THREE.Mesh(
			new THREE.SphereGeometry(HOLE_RADIUS, 32, 24),
			new THREE.MeshBasicMaterial({ color: 0x000000 }),
		)
		blackHoleShadowMesh.scale.setScalar(starRadius)
		group.add(blackHoleShadowMesh)
		blackHoleMesh.renderOrder = 10_000
		group.add(blackHoleMesh)
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
	if (!isBlackHole && !isBrownDwarf && !starSurfaceLayers) group.add(glowSprite)
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
							? // Y dwarfs shared L/T's flat 0.5, reading as effectively
								// dark next to them -- bumped up so a Y primary still
								// visibly lights its own system.
								renderSpectralClass === "Y"
								? 0.9
								: 0.5
							: 2.4
			: 0,
		0,
		0,
	)
	group.add(starLight)
	// AmbientLight has no position/distance falloff -- it lights the whole
	// scene uniformly, so only the primary star adds one. A companion adding
	// its own would stack, washing out every body's day/night terminator
	// regardless of which star it actually orbits.
	if (!isCompanion) {
		const systemAmbient = new THREE.AmbientLight(
			showDaylight ? 0x445566 : 0xffffff,
			showDaylight ? 0.15 : 2.6,
		)
		group.add(systemAmbient)
	}

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
	// A trojan shares its target's orbitalPeriodDays (see generateSystemBodies'
	// trojan roll), so locking its epoch phase to the target's own golden-angle
	// phase plus the rolled ±60° offset keeps it exactly that far ahead/behind
	// the target at every day forever, instead of the arbitrary golden-angle
	// phase every other body gets from its own array index.
	const arrayIndexByIdx = new Map(
		bodies.map((body, index) => [body.idx, index]),
	)
	const placed: PlacedBody[] = bodies.map((body, index) => {
		const trojanTargetIndex =
			body.trojan && body.trojanOfIdx !== undefined
				? arrayIndexByIdx.get(body.trojanOfIdx)
				: undefined
		const meanAnomalyAtEpoch =
			trojanTargetIndex !== undefined
				? trojanTargetIndex * GOLDEN_ANGLE_RAD +
					(body.trojanOffsetDeg ?? 60) * DEG2RAD
				: index * GOLDEN_ANGLE_RAD
		groupCounters[body.group] += 1
		if (body.group === "asteroid belt") {
			return {
				body,
				sceneRadius: BELT_SCENE_RADIUS,
				moonSystemOuterRadius: BELT_SCENE_RADIUS,
				isBelt: true,
				lodTier: 0,
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
		// These three all target `classification`, not `group` -- a body's
		// group (jovian/helian/terrestrial/...) is a broader bucket that can
		// hold several distinct classifications (e.g. a "helian"-group body's
		// classification rolls as "helian", "panthalassic", or "asphodelian";
		// a "jovian"-group body's as "jovian" or "chthonian" -- see
		// classifyBody in environment/index.ts). Checking group instead of
		// classification here previously caught panthalassic bodies under the
		// helian branch (they never even reached their own palette) and would
		// equally mis-catch chthonian bodies under the gas-giant branch.
		const isGasGiant = body.classification === "jovian"
		const isHelian = body.classification === "helian"
		const isPanthalassic = body.classification === "panthalassic"
		const texturePath = body.texturePath
		// The main world's own simulated terrain/vegetation, standing in for
		// its static texturePath image -- see mainWorldTexture's doc comment.
		const mainWorldSatelliteMap = body.isMainWorld ? mainWorldTexture : null
		// A body's exact 2D-UI class swatch (CLASSIFICATION_COLOR) -- the base
		// color the cloud-band palette is derived from. A continent-free
		// vesperian world swaps its gold land tint for full-ocean blue since
		// there's no land left to tint; tectonic always keeps its green, no
		// exceptions.
		const bodySwatchHex =
			body.classification === "vesperian" && (body.hydrosphereCode ?? 0) >= 10
				? FULL_OCEAN_COLOR
				: (CLASSIFICATION_COLOR[body.classification] ??
					(body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR))
		// Helian/panthalassic bodies always render the animated fbm cloud-band
		// mesh; in a procedurally generated system every other non-belt body
		// (the main world included) does too, in place of any texture. Every
		// case is tinted by the body's exact class swatch -- no temperature or
		// per-body variation. The real Sol view keeps its curated textures for
		// everything except helian/panthalassic.
		const cloudBandPalette: CloudBandPalette | null =
			isHelian || isPanthalassic || proceduralSystem
				? swatchCloudBandPalette({ hex: bodySwatchHex })
				: null
		const material = cloudBandPalette
			? buildCloudBandMaterial({
					seed: body.idx,
					palette: cloudBandPalette,
					style: "cloudy",
				})
			: mainWorldSatelliteMap
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
								color: bodySwatchHex,
								roughness: 0.9,
								metalness: 0,
							})
		const mesh = new THREE.Mesh(bodyGeometryForTier(0), material)
		// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
		// XY (Z-north) — a body needs this quarter-turn to bring its geometry
		// pole (and texture "north") onto world +Z. Every downstream rotation
		// system assumes it: the sidereal spin axis (bodySpinAxis = local Y,
		// applied after baseQuaternion), the axial-tilt axis (an in-plane
		// perifocal vector), and solarLockedSpinAngle (which works in the
		// geometry-local frame via inverseBaseQuat). Cloud-band meshes band
		// their noise about object-space Y, so this same turn also carries
		// those bands onto north — they stay latitudinal, just correctly
		// oriented. Untextured solid-color rocky spheres have no visible poles
		// and no locked face to show, so they're left alone.
		if (isGasGiant || texturePath || cloudBandPalette)
			mesh.rotation.x = Math.PI / 2
		mesh.scale.setScalar(sceneRadius)
		bodyGroup.add(mesh)
		let cloudsMesh: THREE.Mesh | undefined
		// The procedural cloud-band mesh already bakes its own banding into the
		// surface -- a separate translucent cloud-texture shell on top of it
		// just muddies that, so it's skipped whenever the body renders one.
		if (body.cloudsTexturePath && !cloudBandPalette) {
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
			cloudsMesh = new THREE.Mesh(bodyGeometryForTier(0), cloudsMaterial)
			cloudsMesh.rotation.x = Math.PI / 2
			cloudsMesh.scale.setScalar(sceneRadius * 1.025)
			cloudsMesh.renderOrder = 2
			bodyGroup.add(cloudsMesh)
		}
		// Drawn after the surface and any cloud shell (renderOrder 3 against
		// the cloud shell's 2), so the limb glow reads as sitting above both.
		const atmosphereMesh = buildBodyAtmosphereShell({
			atmosphere: body.atmosphere,
			bodySwatchHex,
			sceneRadius,
		})
		if (atmosphereMesh) bodyGroup.add(atmosphereMesh)

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
			proceduralSystem,
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
			lodTier: 0,
			bodyGroup,
			mesh,
			atmosphereMesh,
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
	// Looked up by applyPlacedBodyLayout's trojan pass below to copy a trojan's
	// ring (orbitRadius + full kepler ellipse) from the body it shares an
	// Orbit# with, so the two render on the literal same ring instead of two
	// independently size-packed ones.
	const placedByIdx = new Map(placed.map((p) => [p.body.idx, p]))

	// --- Build every companion star's own full nested overlay (recursive --
	// always with companions: [], since this repo's model has no
	// companion-of-a-companion nesting), mounted in a group that will be
	// repositioned every setDay() call. Not positioned yet -- like `placed`
	// above, spacing is resolved below in one combined distance-ordered
	// pass with the planets. ---
	const placedCompanions: PlacedCompanion[] = companions.map(
		(companion, index) => {
			const overlay = buildSolarSystemOverlay({
				...companion.star,
				isCompanion: true,
			})
			const mount = new THREE.Group()
			mount.add(overlay.group)
			group.add(mount)

			const orbitLine = new THREE.Line(
				new THREE.BufferGeometry(),
				new THREE.LineBasicMaterial({
					color: ORBIT_LINE_COLOR_BY_ZONE[companion.role],
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
			proceduralSystem,
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
		p.asteroidField = buildAsteroidField(
			p.orbitRadius,
			p.body.zone === "outer",
			p.beltHalfWidth ?? BELT_WIDTH_MIN / 2,
		)
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
		// Own sceneRadius/moonSystemOuterRadius don't depend on packing order --
		// computed for every body up front so a trojan's footprint is known
		// before its target's slot is packed, regardless of which one the
		// (orbitalDistanceAU-tied, so arbitrarily ordered) sort put first.
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
		}
		// Groups each trojan under the idx of the body it shares an Orbit# with
		// -- consulted below so that body's own slot reserves enough clearance
		// for whichever of the pair has the larger moon system, since a trojan
		// consumes no independent slot of its own (see the isTrojanSlot branch).
		const trojansByTargetIdx = new Map<number, PlacedBody[]>()
		for (const p of placed) {
			if (p.isBelt || !p.body.trojan || p.body.trojanOfIdx === undefined)
				continue
			if (!placedByIdx.has(p.body.trojanOfIdx)) continue
			const list = trojansByTargetIdx.get(p.body.trojanOfIdx) ?? []
			list.push(p)
			trojansByTargetIdx.set(p.body.trojanOfIdx, list)
		}
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
			// A trojan shares its target's ring (set in the trojan pass below)
			// instead of packing its own independent slot -- it must still get
			// its own mesh/quaternion/tilt setup below, just not consume any
			// previousOuterEdge space or get its own orbitRadius/kepler here.
			const isTrojanSlot =
				p.body.trojan === true &&
				p.body.trojanOfIdx !== undefined &&
				placedByIdx.has(p.body.trojanOfIdx)
			// A belt-interior dwarf planet (Ceres, Pallas, Pluto, ...) gets
			// re-anchored onto its belt's own orbitRadius by the belt-child pass
			// below, same as a trojan sharing its target's ring -- it must not
			// consume its own previousOuterEdge space here using ITS OWN
			// eccentricity, since that packed slot is discarded outright. Left
			// ungated (as main-belt Ceres/Pallas were before Kuiper Belt existed),
			// a real-eccentricity outer-system body like Pluto (e=0.248) inflates
			// previousOuterEdge by its own apoapsis before being thrown away, and
			// with three such bodies in a row (Pluto/Haumea/Makemake, all e>0.15)
			// ahead of the Kuiper Belt the inflation compounds enough to push
			// Eris (and suggestedCameraDistance/camera framing with it) out by
			// roughly 10x, shrinking the belt itself to an invisible sliver on
			// screen at the default zoom.
			const isBeltChildSlot =
				p.body.beltOfIdx !== undefined && placedByIdx.has(p.body.beltOfIdx)
			const skipsOwnSlot = isTrojanSlot || isBeltChildSlot
			const trojansHere = trojansByTargetIdx.get(p.body.idx)
			const effectiveMoonSystemOuterRadius = trojansHere?.length
				? Math.max(
						p.moonSystemOuterRadius,
						...trojansHere.map((t) => t.moonSystemOuterRadius),
					)
				: p.moonSystemOuterRadius
			const gap =
				ORBIT_GAP_STAR_RADII * Math.max(p.sceneRadius, starRadius * 0.05)

			if (p.isBelt) {
				// The belt's own half-width scales off its own orbitRadius (real
				// main-belt asteroids span ~0.44x their orbit radius -- see
				// BELT_WIDTH_RATIO's doc), but orbitRadius isn't known until the
				// periapsis below is computed from it, so previousOuterEdge (the
				// belt's inner clearance boundary, only a small `gap` short of its
				// eventual orbitRadius) stands in for it here.
				const beltHalfWidth = Math.max(
					BELT_WIDTH_MIN / 2,
					previousOuterEdge * (BELT_WIDTH_RATIO / 2),
				)
				const periapsis = previousOuterEdge + gap + beltHalfWidth
				p.kepler = undefined
				if (!isTrojanSlot) {
					p.orbitRadius = periapsis
					p.beltHalfWidth = beltHalfWidth
					previousOuterEdge = periapsis + beltHalfWidth
					lastPlanetOuterEdge = previousOuterEdge
				}
				continue
			}

			const periapsis = previousOuterEdge + gap + effectiveMoonSystemOuterRadius
			if (!skipsOwnSlot) p.orbitRadius = periapsis

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
			if (!skipsOwnSlot) {
				const a = periapsis / (1 - e)
				const b = a * Math.sqrt(1 - e * e)
				const { P, Q } = perifocalBasis(Omega, inc, omega)
				p.kepler = { P, Q, a, b, ae: a * e, e }
				previousOuterEdge = a * (1 + e) + effectiveMoonSystemOuterRadius
				lastPlanetOuterEdge = previousOuterEdge
			}

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
		// Trojan pass: re-point each trojan onto the exact ring (orbitRadius +
		// kepler ellipse) of the body it shares an Orbit# with, overriding
		// whatever independent slot the size-packing loop above just gave it --
		// a real trojan orbits at the same radius as its target, just ±60° of
		// mean anomaly away (already baked into meanAnomalyAtEpoch above).
		for (const p of placed) {
			if (p.isBelt || !p.body.trojan || p.body.trojanOfIdx === undefined)
				continue
			const target = placedByIdx.get(p.body.trojanOfIdx)
			if (!target || target.isBelt || !target.kepler) continue
			p.orbitRadius = target.orbitRadius
			p.kepler = { ...target.kepler }
		}
		// Belt-child pass: re-point each belt-interior dwarf planet (Ceres,
		// Pallas, ...) onto its own ring at the belt's own radius, overriding
		// the independent slot the size-packing loop above gave it. Unlike a
		// trojan these aren't offset/shared with the belt's own basis (belts
		// have no kepler -- see the `p.isBelt` branch above, which sets
		// `p.kepler = undefined`); each belt child instead gets its own real
		// eccentricity/inclination ellipse anchored at the belt's radius.
		for (const p of placed) {
			if (p.isBelt || p.body.beltOfIdx === undefined) continue
			const target = placedByIdx.get(p.body.beltOfIdx)
			if (!target || !target.isBelt) continue
			const e = showEllipticalOrbits ? p.body.eccentricity : 0
			const inc = (showInclination ? p.body.inclinationDeg : 0) * DEG2RAD
			const Omega = p.body.longitudeOfAscendingNodeDeg * DEG2RAD
			const omega =
				(p.body.longitudeOfPerihelionDeg - p.body.longitudeOfAscendingNodeDeg) *
				DEG2RAD
			const periapsis = target.orbitRadius
			const a = periapsis / (1 - e)
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(Omega, inc, omega)
			p.orbitRadius = periapsis
			p.kepler = { P, Q, a, b, ae: a * e, e }
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
	starLight.distance = hasSiblingStar ? lastPlanetOuterEdge * 1.05 : 0
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
				color: ORBIT_LINE_COLOR_BY_ZONE[p.body.zone ?? "distant"],
				transparent: true,
				opacity: hostsMainWorld(p) ? 0.75 : 0.5,
				depthWrite: false,
			}),
		)
		orbitLine.renderOrder = 1
		p.orbitLine = orbitLine
		group.add(orbitLine)

		if (p.isBelt) {
			const beltHalfWidth = p.beltHalfWidth ?? BELT_WIDTH_MIN / 2
			const haze = new THREE.Mesh(
				new THREE.RingGeometry(
					p.orbitRadius - beltHalfWidth,
					p.orbitRadius + beltHalfWidth,
					128,
				),
				new THREE.MeshBasicMaterial({
					color: 0xb8b8b8,
					transparent: true,
					// The ring is now wide enough (see BELT_WIDTH_RATIO) that the
					// old flat 0.25 read as a solid disc instead of a haze behind
					// the instanced rocks -- thinned out further so it stays a
					// faint backdrop. Unlit (MeshBasicMaterial), so it doesn't dim
					// under daylight mode's darker ambient the way the lit rocks do
					// -- bumped up in that mode specifically so the ring still helps
					// the band read as a whole against a scene that's otherwise
					// noticeably darker there.
					opacity: showDaylight ? 0.18 : 0.1,
					side: THREE.DoubleSide,
				}),
			)
			// Purely decorative -- untracked in `placed`, so a raycast hit on it
			// can't resolve to anything and would otherwise swallow a double-click
			// aimed at a belt-interior dwarf planet or empty space behind it
			// (resolveHitBodyIndex returning null for an unrecognized hit stops
			// the click dead instead of falling back to the nearest body).
			haze.raycast = () => {
				// Intentionally inert -- see doc above.
			}
			group.add(haze)
			p.asteroidField = buildAsteroidField(
				p.orbitRadius,
				p.body.zone === "outer",
				beltHalfWidth,
			)
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
	 * Ignores body.substellarLon for every body EXCEPT the main world: for
	 * generic-art locked bodies (vesperian/jani-lithic snowball/rockball
	 * textures picked at random from a pool), substellarLon is a leftover
	 * per-body random tag with no matching surface detail, and the art's
	 * dayside is baked into the image's horizontal center -- applying
	 * substellarLon on top of that just rotated each body away from correct
	 * alignment by a different random amount (visibly inconsistent
	 * dayside-to-star facing from one locked planet to the next). The main
	 * world is different: its texture is the actual generated/imported
	 * equirectangular map (mainWorldSatelliteMap), where longitude is real
	 * and substellarLon is the deliberate choice of which longitude the
	 * player locked toward the star, so it must additionally rotate the mesh
	 * to bring that longitude (not the texture's lon=0 center) to face the
	 * star. */
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
		const centerFacingAngle = Math.atan2(-toStarWorld.z, toStarWorld.x)
		if (!p.body.isMainWorld) return centerFacingAngle
		const substellarLonRad = ((p.body.substellarLon ?? 0) * Math.PI) / 180
		return centerFacingAngle - substellarLonRad
	}

	const sunDirectionToStar = new THREE.Vector3()

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
			// The star sits at this group's origin, so the direction from the
			// body back to it is just its negated position. Directions are
			// unaffected by the group's own translation (a companion star's
			// mount), so this is already the world-space direction the shader
			// wants.
			sunDirectionToStar.copy(pos).negate().normalize()
			p.atmosphereMesh?.material.uniforms.sunDirection.value.copy(
				sunDirectionToStar,
			)
			// Moons reuse their planet's direction -- see
			// setAtmosphereSunDirection's own doc for why that is exact enough.
			p.moonState?.setAtmosphereSunDirection?.(sunDirectionToStar)
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
				// Body/cloud meshes share one unit sphere per tessellation tier
				// across every overlay ever built (see bodyGeometryForTier), so
				// disposing one here would break every other body still using it
				// -- same reasoning as the shared body textures just below.
				if (!obj.geometry.userData.sharedGeometry) obj.geometry.dispose()
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

	const lodWorldPosition = new THREE.Vector3()

	// Bodies are drawn from a shared low-tessellation sphere by default, which
	// is indistinguishable from a smooth one until a body actually fills part
	// of the screen — at which point its silhouette turns visibly polygonal.
	// Apparent size is what decides that, not distance alone: a jovian and a
	// dwarf at the same range need different tiers. Only one or two bodies can
	// be large on screen at once, so the higher tiers cost close to nothing.
	function updateLevelOfDetail(camera: THREE.PerspectiveCamera): void {
		const halfHeightTangent = Math.tan((camera.fov * DEG2RAD) / 2)
		for (const p of placed) {
			if (p.isBelt || !p.mesh || !p.bodyGroup) continue
			p.bodyGroup.getWorldPosition(lodWorldPosition)
			const distance = camera.position.distanceTo(lodWorldPosition)
			// The body's projected radius as a fraction of the viewport's
			// half-height — resolution-independent, and correct for any fov.
			const relativeRadius =
				p.sceneRadius / Math.max(distance * halfHeightTangent, 1e-6)
			let tier = 0
			while (
				tier < BODY_LOD_THRESHOLDS.length &&
				relativeRadius >= BODY_LOD_THRESHOLDS[tier]!
			) {
				tier++
			}
			if (p.lodTier === tier) continue
			p.lodTier = tier
			const geometry = bodyGeometryForTier(tier)
			p.mesh.geometry = geometry
			if (p.cloudsMesh) p.cloudsMesh.geometry = geometry
		}
		for (const c of placedCompanions) c.overlay.updateLevelOfDetail(camera)
	}

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
			// MoonOrbitState.getMoonFocus resolves its mesh through the complete
			// scene graph, so a companion moon's position already includes the
			// companion mount translation. Body and star positions are local to the
			// nested overlay, hence only those still need the mount translation.
			if (address.kind === "moon") return focus
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
				radius: (p.beltHalfWidth ?? BELT_WIDTH_MIN / 2) * 2,
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
		starSurfaceLayers?.setSpinHours(hours)
		if (blackHoleDiskMaterial) {
			blackHoleDiskMaterial.uniforms.time.value = hours
		}
		for (const p of placed) {
			if (
				!p.isBelt &&
				p.mesh &&
				p.baseQuaternion &&
				p.body.siderealDayHours > 0
			) {
				const lockedAngle = solarLockedSpinAngle(p)
				const angle = lockedAngle ?? (hours / p.body.siderealDayHours) * TWO_PI
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
		if (object === starMesh || object === blackHoleMesh)
			return { kind: "star", starIndex: 0 }
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			// A belt itself is never a click target (see listAddresses' matching
			// doc below) -- its asteroidField mesh intentionally isn't matched
			// here, so a raycast hit on a stray rock falls through unresolved
			// instead of resolving to the belt.
			if (
				!p.isBelt &&
				(p.mesh === object || p.cloudsMesh === object || p.ringMesh === object)
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

	// Excludes belts -- a belt is a diffuse ring of rocks, not a clickable
	// body, so it's never a valid double-click target either directly (see
	// resolveHitBodyIndex above) or via the nearest-on-screen fallback below.
	// Its interior dwarf planets (Ceres, Pallas, ...) are their own separate
	// placed entries and stay fully clickable.
	function listAddresses(): OrbitAddress[] {
		const addresses: OrbitAddress[] = [{ kind: "star", starIndex: 0 }]
		for (let i = 0; i < placed.length; i++) {
			const p = placed[i]!
			if (!p.isBelt) addresses.push({ kind: "body", starIndex: 0, bodyIdx: i })
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
			// The atmosphere shell's colour, thickness and strength are all
			// baked in at build time, so an edited atmosphere needs a full
			// rebuild rather than the in-place update below.
			if (p.body.atmosphere?.type !== nextBody.atmosphere?.type) return false
			if (p.body.atmosphere?.pressureBar !== nextBody.atmosphere?.pressureBar) {
				return false
			}
			if (p.body.atmosphere?.tainted !== nextBody.atmosphere?.tainted) {
				return false
			}
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
		updateLevelOfDetail,
		dispose,
		getBodyFocus,
		setSpinHours,
		resolveHitBodyIndex,
		listAddresses,
		updateLabelOrientations,
	}
}
