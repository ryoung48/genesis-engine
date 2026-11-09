import * as THREE from "three"
import type { Text } from "troika-three-text"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { SystemBody } from "@/model/celestial/system/types"
import { uiPalette } from "@/ui/components/tokens"
import { buildBodyAtmosphereShell } from "@/ui/genesis/renderer/atmosphere-shell"
import { BODY_MARKER } from "@/ui/genesis/renderer/body-marker"
import {
	createNameLabel,
	createNameLeaderLine,
	IDENTITY_QUATERNION,
	setNameLabelOpacity,
	updateLabelPlacement,
} from "@/ui/genesis/renderer/body-name-label"
import { brownDwarfGlow } from "@/ui/genesis/renderer/brown-dwarf-glow"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"
import { boostCloudAlphaMap } from "@/ui/genesis/renderer/cloud-material"
import { DEFERRED_SHADERS } from "@/ui/genesis/renderer/deferred-shaders"
import { ECLIPSE_SHADOW } from "@/ui/genesis/renderer/eclipse-shadow"
import type { EclipseRing } from "@/ui/genesis/renderer/eclipse-shadow/types"
import {
	buildMoonOrbitOverlay,
	mod2pi,
	orbitPoint,
	perifocalBasis,
	solveKepler,
} from "@/ui/genesis/renderer/moon-orbit-overlay"
import { buildNeutronJets } from "@/ui/genesis/renderer/neutron-jets"
import { buildProceduralBodyMaterial } from "@/ui/genesis/renderer/procedural-body-material"
import { STAR_FLARE } from "@/ui/genesis/renderer/star-flare"
import {
	buildStarGlowMaterial,
	buildStarSurfaceLayers,
	STAR_GLOW_RADIUS_SCALE,
} from "@/ui/genesis/renderer/star-surface-material"
import {
	buildAsteroidField,
	updateAsteroidField,
} from "@/ui/genesis/solar-system/overlay/asteroid-field"
import {
	BODY_GAP_FRACTION,
	BODY_LOD_SEGMENTS,
	BODY_LOD_THRESHOLDS,
	BODY_MARKER_MIN_ORBIT_SCREEN_RADIUS,
	CLASSIFICATION_COLOR,
	DEG2RAD,
	FULL_OCEAN_COLOR,
	GOLDEN_ANGLE_RAD,
	JOVIAN_COLOR_BY_ZONE,
	KM_PER_AU,
	LABEL_FADE_LARGE_ORBIT,
	LABEL_FADE_LARGE_RADIUS_KM,
	LABEL_FADE_SMALL_ORBIT,
	LABEL_FADE_SMALL_RADIUS_KM,
	LAYOUT_OUTER_RADIUS,
	MAIN_WORLD_COLOR,
	MAX_BODY_TO_STAR_SCALE,
	MAX_ORBIT_SPREAD,
	MIN_BODY_SCALE_FRACTION,
	MIN_ORBIT_GAP_AU,
	MIN_STAR_RADIUS_SUN_FRACTION,
	MIN_STAR_SIZE,
	ORBIT_LINE_COLOR_BY_ZONE,
	READABLE_STAR_MAX_INNER_PERIAPSIS_FRACTION,
	ROCKY_SIBLING_COLOR,
	STAR_COLOR_BY_CLASS,
	STAR_LIGHT_CUTOFF_OUTER_EDGE_FACTOR,
	STAR_LOG_SLOPE,
	STAR_MAX_INNER_PERIAPSIS_FRACTION,
	SUN_DRAWN_RADIUS,
	TWO_PI,
} from "@/ui/genesis/solar-system/overlay/constants"
import {
	beltEdgesAU,
	bodyDisplayName,
	bodySizeUnits,
} from "@/ui/genesis/solar-system/overlay/helpers"
import { ORBIT_TRAIL } from "@/ui/genesis/solar-system/overlay/orbit-trail"
import { loadBodyTexture } from "@/ui/genesis/solar-system/overlay/textures"
import type {
	CompanionBand,
	ComputeBodyScaleInput,
	DistanceMapping,
	DrawnDistanceInput,
	LabelVisibilityInput,
	LayoutSlot,
	OrbitAddress,
	PlacedBody,
	PlacedCompanion,
	PlacedLayout,
	SolarSystemOverlayParams,
	SolarSystemOverlayState,
} from "@/ui/genesis/solar-system/overlay/types"

const NEUTRON_STAR_SURFACE_FACTOR = 0.28
// The black-hole disc shader's torus reaches ~1.8 local units; its bounding
// sphere is radius 2.
const BLACK_HOLE_BOUNDS_RADIUS = 2

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
		showBodyNames,
		showBodyMarkers,
		showRealNames,
		namesEnabled,
		starName,
		mainWorldTexture,
		proceduralSystem,
		isCompanion,
		parentStarSizeScale,
		trueScale,
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
	const brownDwarfClass =
		renderSpectralClass === "L" ||
		renderSpectralClass === "T" ||
		renderSpectralClass === "Y"
			? renderSpectralClass
			: null
	const isBrownDwarf = brownDwarfClass !== null
	const brownDwarfGlowSettings = brownDwarfClass
		? brownDwarfGlow({
				spectralClass: brownDwarfClass,
				subtype: hostStar?.subtype ?? starSubtype,
			})
		: null
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
	const starRadiusAU = STAR.getStarRadiusAU({ diameterSol: starDiameterSol })
	// True scale: the star's real radius at the system's units-per-AU. A
	// neutron star's visible surface is a fraction of starRadius, so starRadius
	// is sized for that surface to get the floor.
	const unitsPerAU = trueScale ? (params.unitsPerAU ?? computeUnitsPerAU()) : 1
	const uncappedStarSize = trueScale
		? Math.max(
				MIN_STAR_RADIUS_SUN_FRACTION *
					(ORBIT_BODY.solarDiameterKm / 2 / KM_PER_AU),
				starRadiusAU,
			) * unitsPerAU
		: SUN_DRAWN_RADIUS *
			Math.max(
				MIN_STAR_SIZE,
				1 + STAR_LOG_SLOPE * Math.log10(Math.max(starDiameterSol, 1e-12)),
			)
	const uncappedStarRadius =
		uncappedStarSize / (isNeutronStar ? NEUTRON_STAR_SURFACE_FACTOR : 1)
	// Orbits are drawn from the star's centre, so the star is capped inside its
	// innermost drawn orbit (bodies, belts and companions alike) -- the guard
	// against giants.
	function computeStarRadius(starBodies: SystemBody[]): number {
		let innermostAU = Number.POSITIVE_INFINITY
		for (const body of starBodies) {
			const periapsisAU =
				body.group === "asteroid belt"
					? beltEdgesAU(body).minAU
					: body.orbitalDistanceAU * (1 - eccentricityOf(body.eccentricity))
			innermostAU = Math.min(innermostAU, periapsisAU)
		}
		for (const companion of companions) {
			if (companion.parentIndex > 0) continue
			innermostAU = Math.min(
				innermostAU,
				companion.orbitalDistanceAU *
					(1 - eccentricityOf(companion.eccentricity)),
			)
		}
		// A companion is shrunk at least as much as the star it orbits, so stars
		// sharing a view keep their true size order.
		const sharedRadius = uncappedStarRadius * (parentStarSizeScale ?? 1)
		if (!Number.isFinite(innermostAU)) return sharedRadius
		const extent = isBlackHole ? BLACK_HOLE_BOUNDS_RADIUS : 1
		const innermostDrawn = trueScale
			? innermostAU * unitsPerAU
			: drawnDistance({
					mapping: computeDistanceMapping(starBodies),
					au: innermostAU,
				})
		return Math.min(
			sharedRadius,
			((trueScale
				? STAR_MAX_INNER_PERIAPSIS_FRACTION
				: READABLE_STAR_MAX_INNER_PERIAPSIS_FRACTION) *
				innermostDrawn) /
				extent,
		)
	}
	const starRadius = computeStarRadius(bodies)
	const starColorHex = isGiant
		? uiPalette.giantStar
		: (brownDwarfGlowSettings?.color ??
			STAR_COLOR_BY_CLASS[renderSpectralClass] ??
			"#fff772")
	// Profiles created before active disks were made mandatory retain zero
	// luminosity in persisted sessions; render them as active immediately too.
	const blackHoleLuminositySol = hostStar?.luminositySol || 1
	const hasActiveAccretionDisk = isBlackHole
	const diskColorHex = isBlackHole ? "#ff9b54" : starColorHex
	const renderedStarColorHex = isNeutronStar ? "#dbeafe" : starColorHex
	const starColor = new THREE.Color(renderedStarColorHex)
	const starSurfaceLayers =
		!isBlackHole && !isBrownDwarf
			? buildStarSurfaceLayers({
					spectralClass: renderSpectralClass,
					isGiant,
					tint: isNeutronStar
						? new THREE.Color(uiPalette.neutronStarGlow)
						: starColor,
					diameterSol: starDiameterSol,
				})
			: null
	const brownDwarfMaterial = brownDwarfClass
		? buildCloudBandMaterial({
				seed: Math.round(starSubtype * 997 + starDiameterSol * 101),
				style:
					brownDwarfClass === "L"
						? "brown-dwarf-l"
						: brownDwarfClass === "T"
							? "brown-dwarf-t"
							: "brown-dwarf-y",
				palette: swatchCloudBandPalette({
					hex: Number.parseInt(brownDwarfGlowSettings!.color.slice(1), 16),
				}),
			})
		: null
	if (brownDwarfMaterial) {
		brownDwarfMaterial.emissive.set(0xffffff)
		brownDwarfMaterial.emissiveIntensity = 0.75
	}
	const starMaterial: THREE.Material =
		starSurfaceLayers?.surface ??
		brownDwarfMaterial ??
		new THREE.MeshBasicMaterial({
			color: isBlackHole ? 0x000000 : starColor,
		})
	const starSurfaceRadius = isBlackHole
		? starRadius * 0.18
		: isNeutronStar
			? starRadius * NEUTRON_STAR_SURFACE_FACTOR
			: starRadius
	DEFERRED_SHADERS.mark({
		material: starMaterial,
		deferral: { kind: "stand-in", color: starColor.getHex(), lit: false },
	})
	const starMesh = new THREE.Mesh(
		new THREE.SphereGeometry(starSurfaceRadius, 48, 32),
		starMaterial,
	)
	// SphereGeometry's poles sit on ±Y, but this scene's equatorial plane is
	// XY (Z-north) — without this the star renders "on its side" relative to
	// the planets' orbital plane. Same fix already applied to the gas-giant
	// mesh elsewhere in this renderer.
	starMesh.rotation.x = Math.PI / 2
	group.add(starMesh)
	// A black hole draws its own accretion-disc glow instead.
	const starFlare = isBlackHole
		? null
		: STAR_FLARE.create({
				color: starColor,
				intensity: isBrownDwarf ? 0.5 : 1,
			})
	if (starFlare) group.add(starFlare)
	const haloMaterial =
		starSurfaceLayers?.glow ??
		(brownDwarfGlowSettings
			? buildStarGlowMaterial({
					tint: brownDwarfGlowSettings.haloTint,
					strength: brownDwarfGlowSettings.haloOpacity,
				})
			: null)
	if (haloMaterial) {
		DEFERRED_SHADERS.mark({
			material: haloMaterial,
			deferral: { kind: "hide" },
		})
		// A unit sphere scaled to the star, so the corona tracks it if
		// starRadius is ever recomputed.
		const coronaMesh = new THREE.Mesh(
			new THREE.SphereGeometry(1, 48, 32),
			haloMaterial,
		)
		coronaMesh.scale.setScalar(
			starSurfaceRadius * STAR_GLOW_RADIUS_SCALE * (isNeutronStar ? 1.25 : 1),
		)
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
		blackHoleMesh = new THREE.Mesh(
			new THREE.SphereGeometry(BLACK_HOLE_BOUNDS_RADIUS, 48, 32),
			blackHoleDiskMaterial,
		)
		blackHoleMesh.scale.setScalar(starRadius)
		DEFERRED_SHADERS.mark({
			material: blackHoleDiskMaterial,
			deferral: { kind: "hide" },
		})
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
		const neutronJets = buildNeutronJets({
			color: new THREE.Color(uiPalette.neutronStarGlow),
			starRadius: starSurfaceRadius,
			beamLength: starRadius * 5,
		})
		group.add(neutronJets.group)
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
							? brownDwarfGlowSettings!.lightIntensity
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
				sceneRadius: 0,
				isBelt: true,
				lodTier: 0,
				orbitRadius: 0,
				meanAnomalyAtEpoch,
			}
		}

		const sceneRadius = trueScale
			? (body.diameterKm / 2 / KM_PER_AU) * unitsPerAU
			: bodySizeUnits(body.diameterKm) *
				SUN_DRAWN_RADIUS *
				MAX_BODY_TO_STAR_SCALE
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
		// The class swatch is the base color for most procedural surfaces;
		// generated jovians pick a color from their orbital-zone palette. A continent-free
		// vesperian world swaps its gold land tint for full-ocean blue since
		// there's no land left to tint; tectonic always keeps its green, no
		// exceptions.
		const jovianPalette = JOVIAN_COLOR_BY_ZONE[body.zone ?? "outer"]
		const jovianColor =
			jovianPalette[
				Math.abs(Math.floor(body.orbitalDistanceAU * 1000) + body.idx * 37) %
					jovianPalette.length
			]!
		const bodySwatchHex =
			proceduralSystem && isGasGiant
				? jovianColor
				: body.classification === "vesperian" &&
						(body.hydrosphereCode ?? 0) >= 10
					? FULL_OCEAN_COLOR
					: (CLASSIFICATION_COLOR[body.classification] ??
						(body.isMainWorld ? MAIN_WORLD_COLOR : ROCKY_SIBLING_COLOR))
		// Bodies without authored photos use shaders in Sol too.
		const usesProceduralMaterial =
			isHelian || isPanthalassic || proceduralSystem || !texturePath
		const material = usesProceduralMaterial
			? buildProceduralBodyMaterial({
					seed: body.idx,
					classification: body.classification,
					atmosphere: body.atmosphere,
					swatchHex: bodySwatchHex,
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
		if (isGasGiant || texturePath || usesProceduralMaterial)
			mesh.rotation.x = Math.PI / 2
		mesh.scale.setScalar(sceneRadius)
		bodyGroup.add(mesh)
		let cloudsMesh: THREE.Mesh | undefined
		// The procedural cloud-band mesh already bakes its own banding into the
		// surface -- a separate translucent cloud-texture shell on top of it
		// just muddies that, so it's skipped whenever the body renders one.
		if (body.cloudsTexturePath && !usesProceduralMaterial) {
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
			showAxialTilt,
			showBodyNames,
			showRealNames,
			body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
			proceduralSystem,
			showBodyMarkers,
			true,
			trueScale,
		)
		moonState.group.scale.setScalar(sceneRadius)
		bodyGroup.add(moonState.group)
		// Moons and the ring shade the planet's surface and clouds; the planet
		// shades its ring (moons get their shadows from their own overlay).
		const eclipse = ECLIPSE_SHADOW.createState()
		ECLIPSE_SHADOW.attachToLitSurface({
			material: mesh.material,
			state: eclipse,
		})
		if (cloudsMesh) {
			ECLIPSE_SHADOW.attachToLitSurface({
				material: cloudsMesh.material as THREE.Material,
				state: eclipse,
			})
		}
		const ringEclipse = ringMesh ? ECLIPSE_SHADOW.createState() : undefined
		if (ringMesh && ringEclipse) {
			ECLIPSE_SHADOW.attachToUnlitRing({
				material: ringMesh.material as THREE.Material,
				state: ringEclipse,
			})
		}
		const marker = showBodyMarkers
			? BODY_MARKER.create(ORBIT_LINE_COLOR_BY_ZONE[body.zone ?? "distant"])
			: undefined
		if (marker) bodyGroup.add(marker)
		group.add(bodyGroup)

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
			bodyGroup.add(nameLabel)
			bodyGroup.add(nameLeader)
		}

		return {
			body,
			sceneRadius,
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
			marker,
			eclipse,
			ringEclipse,
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
				parentStarSizeScale: starRadius / uncappedStarRadius,
				unitsPerAU,
				trueScale,
			})
			const mount = new THREE.Group()
			mount.add(overlay.group)
			group.add(mount)

			const orbitLine = ORBIT_TRAIL.create({
				color: ORBIT_LINE_COLOR_BY_ZONE[companion.role],
				peakOpacity: 0.7,
			})
			group.add(orbitLine)

			return {
				mount,
				overlay,
				orbitalPeriodDays: companion.orbitalPeriodDays,
				eccentricity: companion.eccentricity,
				inclinationDeg: companion.inclinationDeg,
				orbitalDistanceAU: companion.orbitalDistanceAU,
				kepler: {
					P: new THREE.Vector3(),
					Q: new THREE.Vector3(),
					a: 0,
					b: 0,
					ae: 0,
					e: 0,
				},
				orbitLine,
				parentIndex: companion.parentIndex,
				meanAnomalyAtEpoch: index * GOLDEN_ANGLE_RAD,
			}
		},
	)
	// A companion of a companion (an epistellar pair around a distant star)
	// moves with its parent: it and its orbit ring live in the parent's mount,
	// so its distances are measured from the parent, not the primary.
	for (const c of placedCompanions) {
		if (c.parentIndex <= 0) continue
		const parent = placedCompanions[c.parentIndex - 1]
		if (!parent || parent === c) continue
		c.parent = parent
		parent.mount.add(c.mount)
		parent.mount.add(c.orbitLine)
	}

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
			showAxialTilt,
			showBodyNames,
			showRealNames,
			p.body.isMainWorld ? "Luna" : undefined,
			namesEnabled,
			proceduralSystem,
			showBodyMarkers,
			true,
			trueScale,
		)
		p.moonState.group.scale.setScalar(p.sceneRadius)
		p.bodyGroup.add(p.moonState.group)
	}

	function rebuildAsteroidFieldForPlacedBody(p: PlacedBody) {
		if (!p.isBelt) return
		if (p.asteroidField) {
			group.remove(p.asteroidField.points)
			p.asteroidField.points.geometry.dispose()
			;(p.asteroidField.points.material as THREE.Material).dispose()
		}
		if (!p.beltEdges) return
		p.asteroidField = buildAsteroidField({
			innerRadius: p.beltEdges.inner,
			outerRadius: p.beltEdges.outer,
			isOuterZone: p.body.zone === "outer",
		})
		group.add(p.asteroidField.points)
	}

	function eccentricityOf(eccentricity: number): number {
		return showEllipticalOrbits ? eccentricity : 0
	}

	// Units per AU that lands the system's farthest apoapsis, belt edge or
	// companion star on LAYOUT_OUTER_RADIUS.
	function computeUnitsPerAU(): number {
		let farthestAU = 0
		for (const body of bodies) {
			farthestAU = Math.max(
				farthestAU,
				body.group === "asteroid belt"
					? beltEdgesAU(body).maxAU
					: body.orbitalDistanceAU * (1 + eccentricityOf(body.eccentricity)),
			)
		}
		for (const companion of companions) {
			if (companion.parentIndex > 0) continue
			farthestAU = Math.max(
				farthestAU,
				companion.orbitalDistanceAU *
					(1 + eccentricityOf(companion.eccentricity)),
			)
		}
		return farthestAU > 0 ? LAYOUT_OUTER_RADIUS / farthestAU : 1
	}

	// Bodies and companion stars share one distance-ordered walk, so a close
	// "epistellar" companion lands among the inner planets.
	const layoutSlots: LayoutSlot[] = [
		...placed.map((p, placedIndex) => ({
			kind: "body" as const,
			placedIndex,
			orbitalDistanceAU: p.body.orbitalDistanceAU,
		})),
		...placedCompanions.flatMap((c, companionIndex) =>
			c.parent
				? []
				: [
						{
							kind: "companion" as const,
							companionIndex,
							orbitalDistanceAU: c.orbitalDistanceAU,
						},
					],
		),
	].sort((a, b) => a.orbitalDistanceAU - b.orbitalDistanceAU)

	function orbitGapAU(au: number): number {
		return Math.max(au - starRadiusAU, MIN_ORBIT_GAP_AU)
	}

	// The power-law exponent (see MAX_ORBIT_SPREAD) from this system's own
	// spread of periapsis and belt gaps, and the scale that lands its farthest
	// apoapsis or belt edge on LAYOUT_OUTER_RADIUS.
	function computeDistanceMapping(starBodies: SystemBody[]): DistanceMapping {
		const gaps: number[] = []
		for (const body of starBodies) {
			if (body.group === "asteroid belt") {
				const { minAU, maxAU } = beltEdgesAU(body)
				gaps.push(orbitGapAU(minAU), orbitGapAU(maxAU))
				continue
			}
			const e = eccentricityOf(body.eccentricity)
			gaps.push(orbitGapAU(body.orbitalDistanceAU * (1 - e)))
		}
		if (gaps.length === 0) return { exponent: 1, scale: 1 }
		const spread = Math.max(...gaps) / Math.min(...gaps)
		const exponent =
			spread > 1
				? Math.min(1, Math.log(MAX_ORBIT_SPREAD) / Math.log(spread))
				: 1
		let scale = Number.POSITIVE_INFINITY
		for (const body of starBodies) {
			if (body.group === "asteroid belt") {
				scale = Math.min(
					scale,
					LAYOUT_OUTER_RADIUS / orbitGapAU(beltEdgesAU(body).maxAU) ** exponent,
				)
				continue
			}
			const e = eccentricityOf(body.eccentricity)
			scale = Math.min(
				scale,
				(LAYOUT_OUTER_RADIUS * (1 - e)) /
					(1 + e) /
					orbitGapAU(body.orbitalDistanceAU * (1 - e)) ** exponent,
			)
		}
		return { exponent, scale }
	}

	let distanceMapping: DistanceMapping = { exponent: 1, scale: 1 }

	// A circular distance in AU -> drawn distance from the star's centre.
	function drawnDistance({ mapping, au }: DrawnDistanceInput): number {
		return mapping.scale * orbitGapAU(au) ** mapping.exponent
	}

	function mapDistanceAU(au: number): number {
		return drawnDistance({ mapping: distanceMapping, au })
	}

	// A trojan or belt-interior body shares a ring with another orbit, so it
	// claims no spacing of its own.
	function sharesRing(p: PlacedBody): boolean {
		return (
			(p.body.trojan === true &&
				p.body.trojanOfIdx !== undefined &&
				placedByIdx.has(p.body.trojanOfIdx)) ||
			(p.body.beltOfIdx !== undefined && placedByIdx.has(p.body.beltOfIdx))
		)
	}

	// Compressing distances by gap^p shrinks a far orbit more than a near one,
	// so a body drawn at true relative size looks ever larger against its
	// orbit the farther out it is. Scaling each body by gap^(p - 1), the same
	// compression its orbit got, keeps size-to-orbit even across the system
	// (identity at p = 1); normalised at a 1 AU gap.
	function orbitSizeFactor(body: SystemBody): number {
		return orbitGapAU(body.orbitalDistanceAU) ** (distanceMapping.exponent - 1)
	}

	// The one factor that sizes every body: as large as possible while each
	// body plus its moon system fits BODY_GAP_FRACTION of the gap to its
	// nearest obstacle: a neighbouring orbit, a companion star's occupied band,
	// or the star's surface.
	function computeBodyScale({
		drawnSemiMajor,
		companionBands,
	}: ComputeBodyScaleInput): number {
		const spaced = placed
			.filter((p) => !p.isBelt && !sharesRing(p))
			.sort((a, b) => drawnSemiMajor.get(a)! - drawnSemiMajor.get(b)!)
		// Bodies shrink by the same factor the inner-orbit cap shrank the star,
		// so the star-to-planet size ratio holds.
		const maxScale =
			SUN_DRAWN_RADIUS *
			MAX_BODY_TO_STAR_SCALE *
			(starRadius / uncappedStarRadius)
		let scale = maxScale
		spaced.forEach((p, index) => {
			const a = drawnSemiMajor.get(p)!
			let innerLimit =
				index === 0 ? starRadius : drawnSemiMajor.get(spaced[index - 1]!)!
			const outerNeighbour = spaced[index + 1]
			let outerLimit = outerNeighbour
				? drawnSemiMajor.get(outerNeighbour)!
				: Number.POSITIVE_INFINITY
			for (const band of companionBands) {
				if (band.outer <= a) innerLimit = Math.max(innerLimit, band.outer)
				else if (band.inner >= a) outerLimit = Math.min(outerLimit, band.inner)
			}
			const gap = Math.min(a - innerLimit, outerLimit - a)
			const extent =
				bodySizeUnits(p.body.diameterKm) *
				orbitSizeFactor(p.body) *
				(p.moonState?.outerRadius ?? 1)
			scale = Math.min(scale, (BODY_GAP_FRACTION * gap) / extent)
		})
		return Math.max(scale, maxScale * MIN_BODY_SCALE_FRACTION)
	}

	// Two stars' coronas reach STAR_GLOW_RADIUS_SCALE times their radii, so a
	// star needs that much beyond its surface before anything else begins.
	function coronaClearance(radius: number): number {
		return (STAR_GLOW_RADIUS_SCALE - 1) * radius
	}

	// Populated by applyPlacedBodyLayout, read by starLight's distance cutoff
	// below -- must be declared before that function's first call.
	let lastPlanetOuterEdge = starRadius

	function companionStarRadius(c: PlacedCompanion): number {
		return c.overlay.getBodyFocus({ kind: "star", starIndex: 0 })?.radius ?? 0
	}

	function companionStarFootprint(c: PlacedCompanion): number {
		const radius = companionStarRadius(c)
		return Math.max(c.overlay.outerRadius, radius + coronaClearance(radius))
	}

	// A companion's own bodies plus every star orbiting it.
	function companionFootprint(c: PlacedCompanion): number {
		let footprint = companionStarFootprint(c)
		for (const child of placedCompanions) {
			if (child.parent !== c) continue
			footprint = Math.max(
				footprint,
				child.kepler.a * (1 + child.kepler.e) + companionStarFootprint(child),
			)
		}
		return footprint
	}

	// A star orbiting another companion is measured from that companion: true
	// distance at true scale, otherwise just clear of the parent's own system.
	function layoutNestedCompanions(): void {
		for (const c of placedCompanions) {
			if (!c.parent) continue
			const e = eccentricityOf(c.eccentricity)
			const inc = (showInclination ? c.inclinationDeg : 0) * DEG2RAD
			const a = trueScale
				? c.orbitalDistanceAU * unitsPerAU
				: (companionStarFootprint(c.parent) + companionStarFootprint(c)) /
					(1 - e)
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(0, inc, 0)
			c.kepler = { P, Q, a, b, ae: a * e, e }
		}
	}

	// Lays out every orbit through the adaptive power law (an ellipse keeps
	// its true eccentricity: a = drawn periapsis / (1 - e)), walking outward
	// in distance order. A companion star is pushed clear of everything inside
	// it, coronas included, and every orbit past a companion is pushed clear
	// of it in turn. Bodies are then sized to the resulting spacing.
	function layoutReadable(): PlacedLayout {
		layoutNestedCompanions()
		distanceMapping = computeDistanceMapping(placed.map((p) => p.body))
		const drawnSemiMajor = new Map<PlacedBody, number>()
		const companionBands: CompanionBand[] = []
		let innerEdge = starRadius + coronaClearance(starRadius)
		let clearOfCompanions = starRadius
		let outerEdge = starRadius
		for (const slot of layoutSlots) {
			if (slot.kind === "companion") {
				const c = placedCompanions[slot.companionIndex]!
				const e = eccentricityOf(c.eccentricity)
				const inc = (showInclination ? c.inclinationDeg : 0) * DEG2RAD
				const footprint = companionFootprint(c)
				const periapsis = Math.max(
					mapDistanceAU(c.orbitalDistanceAU * (1 - e)),
					innerEdge + footprint,
				)
				const a = periapsis / (1 - e)
				const b = a * Math.sqrt(1 - e * e)
				const { P, Q } = perifocalBasis(0, inc, 0)
				c.kepler = { P, Q, a, b, ae: a * e, e }
				const band = {
					inner: a * (1 - e) - footprint,
					outer: a * (1 + e) + footprint,
				}
				companionBands.push(band)
				innerEdge = Math.max(innerEdge, band.outer)
				// One footprint of margin past the band, so the first orbit beyond
				// a companion has room for a body instead of a zero gap that would
				// shrink every body in the system to its floor.
				clearOfCompanions = Math.max(clearOfCompanions, band.outer + footprint)
				outerEdge = Math.max(outerEdge, band.outer)
				continue
			}

			const p = placed[slot.placedIndex]!
			if (p.isBelt) {
				const { minAU, maxAU } = beltEdgesAU(p.body)
				const shift = Math.max(0, clearOfCompanions - mapDistanceAU(minAU))
				p.orbitRadius = mapDistanceAU(p.body.orbitalDistanceAU) + shift
				p.beltEdges = {
					inner: mapDistanceAU(minAU) + shift,
					outer: mapDistanceAU(maxAU) + shift,
				}
				p.kepler = undefined
				innerEdge = Math.max(innerEdge, p.beltEdges.outer)
				continue
			}
			const e = eccentricityOf(p.body.eccentricity)
			const periapsis = Math.max(
				mapDistanceAU(p.body.orbitalDistanceAU * (1 - e)),
				clearOfCompanions,
			)
			const a = periapsis / (1 - e)
			drawnSemiMajor.set(p, a)
			innerEdge = Math.max(innerEdge, a * (1 + e))
		}
		const bodyScale = computeBodyScale({ drawnSemiMajor, companionBands })
		return { drawnSemiMajor, bodyScale, outerEdge }
	}

	// Every orbit at the one true scale (an ellipse keeps its true
	// eccentricity); bodies are sized from their real radius instead.
	function layoutTrueScale(): PlacedLayout {
		const drawnSemiMajor = new Map<PlacedBody, number>()
		let outerEdge = starRadius
		layoutNestedCompanions()
		for (const c of placedCompanions) {
			if (c.parent) continue
			const e = eccentricityOf(c.eccentricity)
			const inc = (showInclination ? c.inclinationDeg : 0) * DEG2RAD
			const a = c.orbitalDistanceAU * unitsPerAU
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(0, inc, 0)
			c.kepler = { P, Q, a, b, ae: a * e, e }
			outerEdge = Math.max(outerEdge, a * (1 + e) + c.overlay.outerRadius)
		}
		for (const p of placed) {
			if (p.isBelt) {
				const { minAU, maxAU } = beltEdgesAU(p.body)
				p.orbitRadius = p.body.orbitalDistanceAU * unitsPerAU
				p.beltEdges = { inner: minAU * unitsPerAU, outer: maxAU * unitsPerAU }
				p.kepler = undefined
				continue
			}
			drawnSemiMajor.set(p, p.body.orbitalDistanceAU * unitsPerAU)
		}
		return { drawnSemiMajor, outerEdge }
	}

	// Lays out every orbit and sizes every body for the chosen scale. Returns
	// the system's outer edge.
	function applyPlacedBodyLayout(): number {
		const layout = trueScale ? layoutTrueScale() : layoutReadable()
		const { drawnSemiMajor, bodyScale } = layout
		let { outerEdge } = layout
		lastPlanetOuterEdge = starRadius
		for (const p of placed) {
			if (p.isBelt) {
				if (p.beltEdges) {
					outerEdge = Math.max(outerEdge, p.beltEdges.outer)
					lastPlanetOuterEdge = Math.max(lastPlanetOuterEdge, p.beltEdges.outer)
				}
				continue
			}

			if (bodyScale !== undefined) {
				const nextRadius =
					bodySizeUnits(p.body.diameterKm) * orbitSizeFactor(p.body) * bodyScale
				if (p.sceneRadius > 0) {
					p.atmosphereMesh?.scale.multiplyScalar(nextRadius / p.sceneRadius)
				}
				p.sceneRadius = nextRadius
				p.mesh?.scale.setScalar(p.sceneRadius)
				p.cloudsMesh?.scale.setScalar(p.sceneRadius * 1.025)
				p.ringMesh?.scale.setScalar(p.sceneRadius)
				p.moonState?.group.scale.setScalar(p.sceneRadius)
			}

			const e = eccentricityOf(p.body.eccentricity)
			const inc = (showInclination ? p.body.inclinationDeg : 0) * DEG2RAD
			const Omega = p.body.longitudeOfAscendingNodeDeg * DEG2RAD
			const omega =
				(p.body.longitudeOfPerihelionDeg - p.body.longitudeOfAscendingNodeDeg) *
				DEG2RAD
			const a = drawnSemiMajor.get(p)!
			p.orbitRadius = a
			const b = a * Math.sqrt(1 - e * e)
			const { P, Q } = perifocalBasis(Omega, inc, omega)
			p.kepler = { P, Q, a, b, ae: a * e, e }
			const apoapsisEdge =
				a * (1 + e) + (p.moonState?.outerRadius ?? 1) * p.sceneRadius
			outerEdge = Math.max(outerEdge, apoapsisEdge)
			lastPlanetOuterEdge = Math.max(lastPlanetOuterEdge, apoapsisEdge)

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
		// Trojan pass: a trojan rides its target's exact ellipse, ±60° of mean
		// anomaly away (already baked into meanAnomalyAtEpoch above).
		for (const p of placed) {
			if (p.isBelt || !p.body.trojan || p.body.trojanOfIdx === undefined)
				continue
			const target = placedByIdx.get(p.body.trojanOfIdx)
			if (!target || target.isBelt || !target.kepler) continue
			p.orbitRadius = target.orbitRadius
			p.kepler = { ...target.kepler }
		}
		return outerEdge
	}

	let outerRadius = applyPlacedBodyLayout()
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
	starLight.distance = hasSiblingStar
		? lastPlanetOuterEdge * STAR_LIGHT_CUTOFF_OUTER_EDGE_FACTOR
		: 0
	// A body "hosts" the main world either directly (isMainWorld) or by
	// having it nested in its moons (gas-giant-moon mode) -- both get the
	// same highlighted orbit ring / camera-scale reference below.
	const hostsMainWorld = (p: PlacedBody) =>
		p.body.isMainWorld || p.body.moons.some((moon) => moon.isMainWorld)
	for (const p of placed) {
		// Belts have no orbit line: their rocks and haze already trace the ring.
		if (!p.isBelt) {
			p.orbitLine = ORBIT_TRAIL.create({
				color: ORBIT_LINE_COLOR_BY_ZONE[p.body.zone ?? "distant"],
				peakOpacity: hostsMainWorld(p) ? 0.9 : 0.7,
			})
			group.add(p.orbitLine)
		}

		if (p.isBelt && p.beltEdges) {
			p.asteroidField = buildAsteroidField({
				innerRadius: p.beltEdges.inner,
				outerRadius: p.beltEdges.outer,
				isOuterZone: p.body.zone === "outer",
			})
			group.add(p.asteroidField.points)
		}
	}
	// Each body's own rolled period, which keeps it in step with the "watch
	// one orbit" slider (that slider advances time by orbitalPeriodDays).
	function periodDaysFor(body: SystemBody): number {
		return Math.max(1, body.orbitalPeriodDays || daysPerYear)
	}

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
					updateAsteroidField({
						field: p.asteroidField,
						day,
						centerPeriodDays: periodDaysFor(p.body),
					})
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
			if (p.orbitLine) {
				ORBIT_TRAIL.update({
					trail: p.orbitLine,
					kepler: p.kepler,
					eccentricAnomaly: E,
				})
			}
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
			const E = solveKepler(angle, c.kepler.e)
			c.mount.position.copy(
				orbitPoint(
					E,
					c.kepler.a,
					c.kepler.b,
					c.kepler.ae,
					c.kepler.P,
					c.kepler.Q,
				),
			)
			ORBIT_TRAIL.update({
				trail: c.orbitLine,
				kepler: c.kepler,
				eccentricAnomaly: E,
			})
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
			if (
				obj instanceof THREE.Mesh ||
				obj instanceof THREE.Line ||
				obj instanceof THREE.Points
			) {
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

	const suggestedCameraDistance = outerRadius * 2.2

	const lodWorldPosition = new THREE.Vector3()
	const orbitVisibility = (relativeRadius: number) =>
		THREE.MathUtils.smoothstep(relativeRadius, 0.1, 0.7)

	// Bodies are drawn from a shared low-tessellation sphere by default, which
	// is indistinguishable from a smooth one until a body actually fills part
	// of the screen — at which point its silhouette turns visibly polygonal.
	// Apparent size is what decides that, not distance alone: a jovian and a
	// dwarf at the same range need different tiers. Only one or two bodies can
	// be large on screen at once, so the higher tiers cost close to nothing.
	function updateLevelOfDetail(camera: THREE.PerspectiveCamera): void {
		const halfHeightTangent = Math.tan((camera.fov * DEG2RAD) / 2)
		group.getWorldPosition(lodWorldPosition)
		const viewHalfHeight = Math.max(
			camera.position.distanceTo(lodWorldPosition) * halfHeightTangent,
			1e-6,
		)
		for (const p of placed) {
			if (p.isBelt && p.beltEdges && p.asteroidField) {
				const relativeRadius = p.beltEdges.outer / viewHalfHeight
				const visibility = orbitVisibility(relativeRadius)
				;(p.asteroidField.points.material as THREE.PointsMaterial).opacity =
					0.85 * visibility
			}
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

	const screenBodyWorld = new THREE.Vector3()

	const eclipseStarWorld = new THREE.Vector3()
	const eclipsePlanetWorld = new THREE.Vector3()
	const eclipsePlanetSphere = new THREE.Vector4()
	const eclipseRingNormal = new THREE.Vector3()
	const eclipseRingQuaternion = new THREE.Quaternion()
	const RING_LOCAL_NORMAL = new THREE.Vector3(0, 0, 1)
	// Refreshes every body's eclipse casters from current world positions:
	// moons and ring onto the planet, the planet onto its ring and moons.
	function updateEclipseShadows(): void {
		group.updateMatrixWorld(true)
		group.getWorldPosition(eclipseStarWorld)
		for (const p of placed) {
			if (p.isBelt || !p.bodyGroup || !p.eclipse) continue
			p.bodyGroup.getWorldPosition(eclipsePlanetWorld)
			eclipsePlanetSphere.set(
				eclipsePlanetWorld.x,
				eclipsePlanetWorld.y,
				eclipsePlanetWorld.z,
				p.sceneRadius,
			)
			let ring: EclipseRing | null = null
			if (p.ringMesh && p.body.rings) {
				p.ringMesh.getWorldQuaternion(eclipseRingQuaternion)
				eclipseRingNormal
					.copy(RING_LOCAL_NORMAL)
					.applyQuaternion(eclipseRingQuaternion)
				ring = {
					center: eclipsePlanetWorld,
					normal: eclipseRingNormal,
					innerRadius: p.body.rings.innerRadiusRelative * p.sceneRadius,
					outerRadius: p.body.rings.outerRadiusRelative * p.sceneRadius,
					opacity: p.body.rings.opacity,
				}
			}
			p.moonState?.updateEclipseShadows?.({
				starPosition: eclipseStarWorld,
				parentSphere: eclipsePlanetSphere,
				parentRing: ring,
			})
			p.eclipse.starPosition.copy(eclipseStarWorld)
			ECLIPSE_SHADOW.setSpheres({ state: p.eclipse, spheres: [] })
			if (ring && p.ringEclipse) {
				ECLIPSE_SHADOW.setRing({ state: p.eclipse, ...ring })
				p.ringEclipse.starPosition.copy(eclipseStarWorld)
				ECLIPSE_SHADOW.setSpheres({
					state: p.ringEclipse,
					spheres: [eclipsePlanetSphere],
				})
			}
		}
	}

	// See LABEL_FADE_SMALL_ORBIT: a label fades as its orbit shrinks on
	// screen, small bodies first.
	function labelVisibility({
		orbitScreenRadius,
		radiusKm,
	}: LabelVisibilityInput): number {
		const sizeWeight = THREE.MathUtils.clamp(
			Math.log(Math.max(radiusKm, 1) / LABEL_FADE_SMALL_RADIUS_KM) /
				Math.log(LABEL_FADE_LARGE_RADIUS_KM / LABEL_FADE_SMALL_RADIUS_KM),
			0,
			1,
		)
		const full = THREE.MathUtils.lerp(
			LABEL_FADE_SMALL_ORBIT.full,
			LABEL_FADE_LARGE_ORBIT.full,
			sizeWeight,
		)
		const gone = THREE.MathUtils.lerp(
			LABEL_FADE_SMALL_ORBIT.gone,
			LABEL_FADE_LARGE_ORBIT.gone,
			sizeWeight,
		)
		return THREE.MathUtils.smoothstep(orbitScreenRadius, gone, full)
	}
	// Per frame: every body's outlined-circle marker (shown while the body is
	// drawn too small to find), then its name label, whose leader starts at
	// the ring's edge while the ring shows.
	function updateLabelOrientations(camera: THREE.PerspectiveCamera): void {
		updateEclipseShadows()
		if (starFlare) {
			group.getWorldPosition(screenBodyWorld)
			STAR_FLARE.update({
				flare: starFlare,
				camera,
				projectedRadius:
					starSurfaceRadius /
					Math.max(
						camera.position.distanceTo(screenBodyWorld) *
							Math.tan((camera.fov * DEG2RAD) / 2),
						1e-12,
					),
			})
		}
		if (starNameLabel && starNameLeader) {
			updateLabelPlacement(
				starNameLabel,
				starNameLeader,
				starRadius,
				IDENTITY_QUATERNION,
				camera,
			)
		}
		const halfHeightTangent = Math.tan((camera.fov * DEG2RAD) / 2)
		for (const c of placedCompanions) {
			c.mount.getWorldPosition(screenBodyWorld)
			const screenUnit = Math.max(
				camera.position.distanceTo(screenBodyWorld) * halfHeightTangent,
				1e-12,
			)
			ORBIT_TRAIL.fadeForZoom({
				trail: c.orbitLine,
				bodyScreenRadius: companionStarRadius(c) / screenUnit,
			})
		}
		for (const p of placed) {
			let labelRadius = p.sceneRadius
			p.bodyGroup?.getWorldPosition(screenBodyWorld)
			const screenUnit = Math.max(
				camera.position.distanceTo(screenBodyWorld) * halfHeightTangent,
				1e-12,
			)
			if (p.orbitLine && !p.isBelt) {
				ORBIT_TRAIL.fadeForZoom({
					trail: p.orbitLine,
					bodyScreenRadius: p.sceneRadius / screenUnit,
				})
			}
			if (p.marker && p.bodyGroup) {
				const distance = camera.position.distanceTo(screenBodyWorld)
				BODY_MARKER.update({
					marker: p.marker,
					camera,
					projectedRadius: p.sceneRadius / screenUnit,
					visibility: THREE.MathUtils.smoothstep(
						p.orbitRadius / screenUnit,
						BODY_MARKER_MIN_ORBIT_SCREEN_RADIUS.gone,
						BODY_MARKER_MIN_ORBIT_SCREEN_RADIUS.full,
					),
				})
				if (p.marker.visible) {
					labelRadius = Math.max(
						labelRadius,
						BODY_MARKER.worldRadius({ camera, distance }),
					)
				}
			}
			if (p.nameLabel && p.nameLeader) {
				setNameLabelOpacity({
					label: p.nameLabel,
					leader: p.nameLeader,
					opacity: labelVisibility({
						orbitScreenRadius: p.orbitRadius / screenUnit,
						radiusKm: p.body.diameterKm / 2,
					}),
				})
				if (p.nameLabel.visible) {
					updateLabelPlacement(
						p.nameLabel,
						p.nameLeader,
						labelRadius,
						IDENTITY_QUATERNION,
						camera,
					)
				}
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
			const position = focus.position.clone()
			for (let mounted: PlacedCompanion | undefined = c; mounted; ) {
				position.add(mounted.mount.position)
				mounted = mounted.parent
			}
			return { position, radius: focus.radius }
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
					radius: moonFocus.localRadius * p.sceneRadius,
				}
			}
		}
		if (p.isBelt) {
			return {
				position: new THREE.Vector3(p.orbitRadius, 0, 0),
				radius: p.beltEdges ? p.beltEdges.outer - p.beltEdges.inner : 0,
			}
		}
		if (!p.bodyGroup) return null
		return {
			position: p.bodyGroup.position.clone(),
			radius: p.sceneRadius,
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
				(p.mesh === object ||
					p.cloudsMesh === object ||
					p.ringMesh === object ||
					p.marker === object)
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
		// The star mesh bakes its radius in, so a change to its inner-orbit cap
		// needs a full rebuild.
		if (computeStarRadius(nextBodies) !== starRadius) return false
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

		outerRadius = applyPlacedBodyLayout()
		starLight.distance =
			placedCompanions.length > 0
				? lastPlanetOuterEdge * STAR_LIGHT_CUTOFF_OUTER_EDGE_FACTOR
				: 0
		for (const p of placed) {
			if (p.isBelt) rebuildAsteroidFieldForPlacedBody(p)
		}
		setDay(currentDay)
		setSpinHours(currentSpinHours)
		return true
	}

	return {
		group,
		outerRadius,
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
