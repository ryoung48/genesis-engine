import * as THREE from "three"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import { uiGalaxyMap, uiPalette } from "@/ui/components/tokens"

interface SearchMatchMarkersInput {
	galaxy: Galaxy
	matchingSystemIndices: readonly number[]
}

export function buildSearchMatchMarkers({
	galaxy,
	matchingSystemIndices,
}: SearchMatchMarkersInput) {
	const positions = new Float32Array(matchingSystemIndices.length * 3)
	let vertexCount = 0
	for (const systemIndex of matchingSystemIndices) {
		if (galaxy.r_edge[systemIndex]) continue
		positions[3 * vertexCount] = galaxy.r_xy[2 * systemIndex]!
		positions[3 * vertexCount + 1] = galaxy.r_xy[2 * systemIndex + 1]!
		vertexCount++
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.BufferAttribute(positions.subarray(0, vertexCount * 3), 3),
	)
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uSize: { value: uiGalaxyMap.matchMarkerMinSizePx },
			uStroke: { value: uiGalaxyMap.matchMarkerStrokePx },
			uColor: { value: new THREE.Color(uiPalette.galaxySearchMatch) },
		},
		vertexShader: /* glsl */ `
			uniform float uSize;
			void main() {
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				gl_PointSize = uSize;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uSize;
			uniform float uStroke;
			uniform vec3 uColor;
			void main() {
				float distanceFromEdge = (0.5 - length(gl_PointCoord - 0.5)) * uSize;
				float alpha = smoothstep(0.0, 1.0, distanceFromEdge)
					* (1.0 - smoothstep(uStroke, uStroke + 1.0, distanceFromEdge));
				if (alpha <= 0.0) discard;
				gl_FragColor = vec4(uColor, alpha);
				#include <colorspace_fragment>
			}
		`,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	})
	const markers = new THREE.Points(geometry, material)
	markers.renderOrder = 4
	return markers
}
