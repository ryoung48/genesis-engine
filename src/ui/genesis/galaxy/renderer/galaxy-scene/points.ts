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
// Matches galaxy-gen's renderer/geometry/points.ts createGlowTexture/
// PointsMaterial exactly.
const GLOW_TEXTURE_SIZE = 32
const POINT_SIZE_PX = 4

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

// Soft radial glow -- bright solid core out to 65% radius, then a
// power-curve falloff to the edge. Ported from galaxy-gen's
// renderer/geometry/points.ts createGlowTexture (bumped resolution since
// this repo's default point size renders larger on screen).
let glowTexture: THREE.DataTexture | null = null
function getGlowTexture(): THREE.DataTexture {
	if (glowTexture) return glowTexture
	const size = GLOW_TEXTURE_SIZE
	const data = new Uint8Array(size * size * 4)
	const r = size / 2
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const dx = x - r + 0.5
			const dy = y - r + 0.5
			const t = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / r)
			const alpha = t > 0.65 ? 255 : Math.round(255 * (t / 0.65) ** 1.8)
			const i = (y * size + x) * 4
			data[i] = 255
			data[i + 1] = 255
			data[i + 2] = 255
			data[i + 3] = alpha
		}
	}
	glowTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
	glowTexture.needsUpdate = true
	return glowTexture
}

export interface GalaxyPointsResult {
	points: THREE.Points
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
		for (let j = 0; j < n; j++) {
			const color = colorForStar(
				decodeSpectralClass(starSpectralClass[start + j]!),
				decodeLuminosityClass(starLuminosityClass[start + j]!),
			)
			positions.push(wx, wy, 0)
			colors.push(color.r, color.g, color.b)
			baseCenters.push(wx, wy)
			clusterAngles.push(n > 1 ? (j / n) * Math.PI * 2 : 0)
			clusterFactors.push(n > 1 ? 1 : 0)
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

	const material = new THREE.PointsMaterial({
		size: POINT_SIZE_PX * computeGalaxyDensityScale(numSystems),
		sizeAttenuation: false,
		vertexColors: true,
		map: getGlowTexture(),
		alphaTest: 0.02,
		transparent: true,
	})

	return {
		points: new THREE.Points(geometry, material),
		clusterData: {
			baseCenters: Float32Array.from(baseCenters),
			clusterAngles: Float32Array.from(clusterAngles),
			clusterFactors: Float32Array.from(clusterFactors),
			totalPoints: positions.length / 3,
		},
	}
}
