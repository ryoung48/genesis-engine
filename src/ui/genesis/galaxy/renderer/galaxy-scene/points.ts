import * as THREE from "three"
import {
	decodeLuminosityClass,
	decodeSpectralClass,
} from "@/model/celestial/galaxy/systems/codes"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import { STAR } from "@/model/celestial/star"
import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import { uiPalette } from "@/ui/components/tokens"
import type { ClusterData } from "@/ui/genesis/galaxy/renderer/galaxy-scene/cluster"
import { computeGalaxyDensityScale } from "@/ui/genesis/galaxy/renderer/galaxy-scene/density-scale"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"

const EDGE_COLOR = new THREE.Color(0x333333)
const POINT_SIZE_PX = 4
export const CLUSTER_CENTER_MASK_SIZE_RATIO = 0.5
const BINARY_CLUSTER_FACTOR = 0.8
const TRINARY_CLUSTER_FACTOR = 0.65
const TRINARY_CLUSTER_ANGLE_OFFSET = Math.PI / 2

// Ported from beltoforion/Galaxy-Renderer-Typescript's VertexBufferStars.ts
// (type==0 "star" branch): gl_PointSize set directly per-vertex in the
// vertex shader (no sizeAttenuation), and a soft circular dot computed
// straight in the fragment shader (alpha = 1 - length(circCoord)) rather
// than sampling a baked glow texture, additively blended (SRC_ALPHA, ONE)
// the same way their renderer's draw() configures gl.blendFunc.
const STAR_POINT_VERTEX_SHADER = /* glsl */ `
	attribute vec3 color;
	uniform float uSize;
	varying vec3 vColor;

	void main() {
		vColor = color;
		vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
		gl_Position = projectionMatrix * mvPosition;
		gl_PointSize = uSize;
	}
`

const STAR_POINT_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vColor;

	void main() {
		vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
		float dist = length(circCoord);
		if (dist >= 1.0) discard;
		// A plain (1.0 - dist) linear falloff reads fine at the few-pixel
		// sizes this was originally sized for, but zoomed in (see
		// PortedGalaxyView.tsx's zoom-based uSize scaling) it blows up into a
		// flat-sided cone with a harsh visible edge rather than a glow.
		// Squaring concentrates brightness toward the center and tapers the
		// rim off more gently, closer to how a point-source glow should look
		// at any size.
		float alpha = pow(1.0 - dist, 2.0);
		gl_FragColor = vec4(vColor, alpha);
	}
`

const CLUSTER_CENTER_MASK_FRAGMENT_SHADER = /* glsl */ `
	void main() {
		vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
		if (length(circCoord) >= 1.0) discard;
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
	}
`

const spectralColorCache = new Map<string, THREE.Color>()
function colorForStar(
	spectralClass: SpectralClass,
	luminosityClass: LuminosityClass,
): THREE.Color {
	const key = `${spectralClass}:${luminosityClass}`
	let color = spectralColorCache.get(key)
	if (!color) {
		// Mirrors galaxy-gen's STAR.color: a neutron star's pulsar/magnetar
		// luminosity class overrides its base spectral-class color.
		const hex = STAR.isGiant(luminosityClass)
			? uiPalette.giantStar
			: spectralClass === "NS"
				? STAR.getNeutronStarColor({ spectralClass, luminosityClass })
				: SPECTRAL_CLASS_COLORS[spectralClass]
		color = new THREE.Color(hex)
		spectralColorCache.set(key, color)
	}
	return color
}

export interface GalaxyPointsResult {
	points: THREE.Points
	clusterCenterMasks: THREE.Points
	clusterData: ClusterData
}

/** One glow-sprite point per rolled star, colored by spectral class --
 * multi-star systems get one point per companion, clustered around their
 * shared system center (see cluster.ts's per-frame updateClusterPositions).
 * Edge/boundary systems (Galaxy.r_edge) render as a single dim grey dot
 * rather than being hidden, so the packed ring shape stays visible without
 * reading as playable content. Reads every system's star tree straight out
 * of the galaxy's packed typed arrays (rolled once in the worker -- see
 * GALAXY_SYSTEMS.buildPackedGalaxyStars) instead of calling
 * GALAXY_SYSTEMS.previewStars per system, since that would mean re-deriving
 * an RNG seed and walking the companion tree again for every one of a
 * galaxy's systems on the main thread just to read a color. */
export function buildGalaxyPoints(galaxy: Galaxy): GalaxyPointsResult {
	const {
		numSystems,
		r_xy,
		r_edge,
		systemStarOffset,
		starSpectralClass,
		starLuminosityClass,
	} = galaxy

	const positions: number[] = []
	const clusterCenterMaskPositions: number[] = []
	const colors: number[] = []
	const baseCenters: number[] = []
	const clusterAngles: number[] = []
	const clusterFactors: number[] = []

	for (let i = 0; i < numSystems; i++) {
		const wx = r_xy[2 * i]!
		const wy = r_xy[2 * i + 1]!

		if (r_edge[i]) {
			positions.push(wx, wy, 0)
			colors.push(EDGE_COLOR.r, EDGE_COLOR.g, EDGE_COLOR.b)
			baseCenters.push(wx, wy)
			clusterAngles.push(0)
			clusterFactors.push(0)
			continue
		}

		const start = systemStarOffset[i]!
		const end = systemStarOffset[i + 1]!
		const n = end - start
		if (n > 1) clusterCenterMaskPositions.push(wx, wy, 0)
		for (let j = 0; j < n; j++) {
			const color = colorForStar(
				decodeSpectralClass(starSpectralClass[start + j]!),
				decodeLuminosityClass(starLuminosityClass[start + j]!),
			)
			positions.push(wx, wy, 0)
			colors.push(color.r, color.g, color.b)
			baseCenters.push(wx, wy)
			const isBinary = n === 2
			const isTrinary = n === 3
			clusterAngles.push(
				n > 1
					? (j / n) * Math.PI * 2 +
							(isTrinary ? TRINARY_CLUSTER_ANGLE_OFFSET : 0)
					: 0,
			)
			clusterFactors.push(
				n > 1
					? isBinary
						? BINARY_CLUSTER_FACTOR
						: isTrinary
							? TRINARY_CLUSTER_FACTOR
							: 1
					: 0,
			)
		}
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.BufferAttribute(Float32Array.from(positions), 3),
	)
	geometry.setAttribute(
		"color",
		new THREE.BufferAttribute(Float32Array.from(colors), 3),
	)

	const material = new THREE.ShaderMaterial({
		uniforms: {
			uSize: { value: POINT_SIZE_PX * computeGalaxyDensityScale(numSystems) },
		},
		vertexShader: STAR_POINT_VERTEX_SHADER,
		fragmentShader: STAR_POINT_FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		blending: THREE.CustomBlending,
		blendSrc: THREE.SrcAlphaFactor,
		blendDst: THREE.OneFactor,
		blendEquation: THREE.AddEquation,
	})
	const clusterCenterMaskGeometry = new THREE.BufferGeometry()
	clusterCenterMaskGeometry.setAttribute(
		"position",
		new THREE.BufferAttribute(Float32Array.from(clusterCenterMaskPositions), 3),
	)
	const clusterCenterMaskMaterial = new THREE.ShaderMaterial({
		uniforms: {
			uSize: {
				value:
					POINT_SIZE_PX *
					computeGalaxyDensityScale(numSystems) *
					CLUSTER_CENTER_MASK_SIZE_RATIO,
			},
		},
		vertexShader: STAR_POINT_VERTEX_SHADER,
		fragmentShader: CLUSTER_CENTER_MASK_FRAGMENT_SHADER,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	})
	const clusterCenterMasks = new THREE.Points(
		clusterCenterMaskGeometry,
		clusterCenterMaskMaterial,
	)
	const points = new THREE.Points(geometry, material)
	clusterCenterMasks.renderOrder = 1
	points.renderOrder = 2

	return {
		points,
		clusterCenterMasks,
		clusterData: {
			numSystems,
			baseCenters: Float32Array.from(baseCenters),
			clusterAngles: Float32Array.from(clusterAngles),
			clusterFactors: Float32Array.from(clusterFactors),
			totalPoints: positions.length / 3,
		},
	}
}
