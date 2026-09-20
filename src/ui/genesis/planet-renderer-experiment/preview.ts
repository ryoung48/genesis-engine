import * as THREE from "three"
import { uiChartPalette, uiPalette } from "@/ui/components/tokens"
import type {
	PlanetPreview,
	PlanetPreviewSettings,
} from "@/ui/genesis/planet-renderer-experiment/types"
import { brownDwarfGlow } from "@/ui/genesis/renderer/brown-dwarf-glow"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"
import { buildCraterMaterial } from "@/ui/genesis/renderer/crater-material"
import { buildNeutronJets } from "@/ui/genesis/renderer/neutron-jets"
import {
	buildStarGlowMaterial,
	buildStarSurfaceLayers,
	STAR_GLOW_RADIUS_SCALE,
} from "@/ui/genesis/renderer/star-surface-material"
import { STAR_COLOR_BY_CLASS } from "@/ui/genesis/solar-system/overlay/constants"

export function createPlanetPreview(canvas: HTMLCanvasElement): PlanetPreview {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(uiChartPalette.timingTiers[0])
	const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
	camera.up.set(0, 0, 1)
	camera.position.set(0, 3.6, 0)
	camera.lookAt(0, 0, 0)
	const ambientLight = new THREE.AmbientLight(0xffffff, 1)
	const sunLight = new THREE.DirectionalLight(0xffffff, 2)
	sunLight.position.set(-3, 2, 4)
	scene.add(ambientLight, sunLight)
	const geometry = new THREE.SphereGeometry(1, 96, 64)
	const coronaGeometry = new THREE.SphereGeometry(
		STAR_GLOW_RADIUS_SCALE,
		48,
		32,
	)
	const planet = new THREE.Group()
	const initialMaterial: THREE.Material = new THREE.MeshStandardMaterial()
	const mesh = new THREE.Mesh(geometry, initialMaterial)
	mesh.rotation.x = Math.PI / 2
	planet.add(mesh)
	const neutronColor = new THREE.Color(uiPalette.neutronStarGlow)
	const neutronJets = buildNeutronJets({
		color: neutronColor,
		starRadius: 1,
		beamLength: 3.6,
	})
	neutronJets.group.visible = false
	planet.add(neutronJets.group)
	scene.add(planet)
	let starSurfaceLayers: ReturnType<typeof buildStarSurfaceLayers> | null = null
	let coronaMesh: THREE.Mesh | null = null
	let brownDwarfGlowMesh: THREE.Mesh<
		THREE.SphereGeometry,
		THREE.ShaderMaterial
	> | null = null
	let activePointer: number | null = null
	let previousX = 0
	let previousY = 0

	function render(): void {
		renderer.render(scene, camera)
	}

	function resize(): void {
		const width = canvas.clientWidth
		const height = canvas.clientHeight
		if (width === 0 || height === 0) return
		camera.aspect = width / height
		camera.updateProjectionMatrix()
		renderer.setSize(width, height, false)
		render()
	}

	function pointerDown(event: PointerEvent): void {
		activePointer = event.pointerId
		previousX = event.clientX
		previousY = event.clientY
		canvas.setPointerCapture(event.pointerId)
	}

	function pointerMove(event: PointerEvent): void {
		if (activePointer !== event.pointerId) return
		planet.rotation.y += (event.clientX - previousX) * 0.008
		planet.rotation.x += (event.clientY - previousY) * 0.008
		previousX = event.clientX
		previousY = event.clientY
		render()
	}

	function pointerUp(event: PointerEvent): void {
		if (activePointer === event.pointerId) activePointer = null
	}

	function clearBrownDwarfGlow(): void {
		if (brownDwarfGlowMesh) {
			planet.remove(brownDwarfGlowMesh)
			brownDwarfGlowMesh.material.dispose()
			brownDwarfGlowMesh = null
		}
	}

	canvas.addEventListener("pointerdown", pointerDown)
	canvas.addEventListener("pointermove", pointerMove)
	canvas.addEventListener("pointerup", pointerUp)
	canvas.addEventListener("pointercancel", pointerUp)
	const resizeObserver = new ResizeObserver(resize)
	resizeObserver.observe(canvas)
	resize()

	return {
		setSettings(settings: PlanetPreviewSettings): void {
			const isStar =
				settings.style === "sun" ||
				settings.style === "white-dwarf" ||
				settings.style === "neutron-star"
			const brownDwarfClass =
				settings.style === "brown-dwarf-l"
					? "L"
					: settings.style === "brown-dwarf-t"
						? "T"
						: settings.style === "brown-dwarf-y"
							? "Y"
							: null
			const oldMaterial = mesh.material
			clearBrownDwarfGlow()
			if (coronaMesh) planet.remove(coronaMesh)
			starSurfaceLayers?.glow.dispose()
			starSurfaceLayers = null
			coronaMesh = null
			if (isStar) {
				const spectralClass =
					settings.style === "sun"
						? "G"
						: settings.style === "white-dwarf"
							? "D"
							: "NS"
				starSurfaceLayers = buildStarSurfaceLayers({
					spectralClass,
					isGiant: false,
					tint:
						settings.style === "neutron-star"
							? neutronColor
							: new THREE.Color(STAR_COLOR_BY_CLASS[spectralClass]),
					diameterSol: 1,
				})
				coronaMesh = new THREE.Mesh(coronaGeometry, starSurfaceLayers.glow)
				if (settings.style === "neutron-star") coronaMesh.scale.setScalar(1.25)
				planet.add(coronaMesh)
			}
			if (brownDwarfClass) {
				const glow = brownDwarfGlow({
					spectralClass: brownDwarfClass,
					subtype: 5,
					color: settings.color,
				})
				brownDwarfGlowMesh = new THREE.Mesh(
					coronaGeometry,
					buildStarGlowMaterial({
						tint: glow.haloTint,
						strength: glow.haloOpacity,
					}),
				)
				planet.add(brownDwarfGlowMesh)
			}
			const material =
				settings.style === "sun" ||
				settings.style === "white-dwarf" ||
				settings.style === "neutron-star"
					? starSurfaceLayers!.surface
					: settings.style === "cratered" ||
							settings.style === "martian" ||
							settings.style === "snowball" ||
							settings.style === "meltball"
						? buildCraterMaterial({
								seed: settings.seed,
								color: settings.color,
								style: settings.style,
							})
						: buildCloudBandMaterial({
								seed: settings.seed,
								style: settings.style,
								palette: swatchCloudBandPalette({
									hex: Number.parseInt(settings.color.slice(1), 16),
								}),
							})
			mesh.material = material
			oldMaterial.dispose()
			neutronJets.group.visible = settings.style === "neutron-star"
			camera.position.set(
				0,
				settings.style === "neutron-star" ? 11.8 : isStar ? 5.3 : 3.6,
				0,
			)
			camera.lookAt(0, 0, 0)
			render()
		},
		dispose(): void {
			resizeObserver.disconnect()
			canvas.removeEventListener("pointerdown", pointerDown)
			canvas.removeEventListener("pointermove", pointerMove)
			canvas.removeEventListener("pointerup", pointerUp)
			canvas.removeEventListener("pointercancel", pointerUp)
			geometry.dispose()
			coronaGeometry.dispose()
			neutronJets.dispose()
			clearBrownDwarfGlow()
			mesh.material.dispose()
			starSurfaceLayers?.glow.dispose()
			renderer.dispose()
		},
	}
}
