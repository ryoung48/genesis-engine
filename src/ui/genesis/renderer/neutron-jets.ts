import * as THREE from "three"
import type { NeutronJets, NeutronJetsInput } from "@/ui/genesis/renderer/types"

export function buildNeutronJets(input: NeutronJetsInput): NeutronJets {
	const group = new THREE.Group()
	const geometry = new THREE.CylinderGeometry(
		input.starRadius * 0.75,
		input.starRadius * 0.75,
		input.beamLength,
		64,
		48,
		true,
	)
	const material = new THREE.ShaderMaterial({
		uniforms: { beamColor: { value: input.color } },
		vertexShader: `
			varying float vAxial;
			varying vec3 vNormalView;
			varying vec3 vViewDirection;
			void main() {
				vAxial = uv.y;
				vec3 beamPosition = position;
				float tipRadius = exp(-5.0);
				beamPosition.xz *= (exp(-5.0 * vAxial) - tipRadius)
					/ (1.0 - tipRadius);
				vNormalView = normalize(normalMatrix * normal);
				vViewDirection = normalize(-(modelViewMatrix * vec4(beamPosition, 1.0)).xyz);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(beamPosition, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 beamColor;
			varying float vAxial;
			varying vec3 vNormalView;
			varying vec3 vViewDirection;
			void main() {
				float facing = abs(dot(normalize(vNormalView), normalize(vViewDirection)));
				float fade = smoothstep(0.0, 0.16, vAxial)
					* (1.0 - smoothstep(0.9, 1.0, vAxial));
				float glow = fade * 0.15 * pow(facing, 1.2);
				gl_FragColor = vec4(beamColor, glow);
			}
		`,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.DoubleSide,
	})
	for (const direction of [-1, 1]) {
		const jet = new THREE.Mesh(geometry, material)
		jet.rotation.x = (direction * Math.PI) / 2
		jet.position.z =
			direction * (input.beamLength * 0.5 + input.starRadius * 0.5)
		group.add(jet)
	}
	return {
		group,
		dispose(): void {
			geometry.dispose()
			material.dispose()
		},
	}
}
