import * as THREE from "three"
import { uiChartPalette } from "@/ui/components/tokens"
import type {
	PlanetPreview,
	PlanetPreviewSettings,
} from "@/ui/genesis/planet-renderer-experiment/types"
import {
	buildCloudBandMaterial,
	swatchCloudBandPalette,
} from "@/ui/genesis/renderer/cloud-band-material"
import { buildCraterMaterial } from "@/ui/genesis/renderer/crater-material"

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
	const planet = new THREE.Group()
	const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
	mesh.rotation.x = Math.PI / 2
	planet.add(mesh)
	scene.add(planet)
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

	canvas.addEventListener("pointerdown", pointerDown)
	canvas.addEventListener("pointermove", pointerMove)
	canvas.addEventListener("pointerup", pointerUp)
	canvas.addEventListener("pointercancel", pointerUp)
	const resizeObserver = new ResizeObserver(resize)
	resizeObserver.observe(canvas)
	resize()

	return {
		setSettings(settings: PlanetPreviewSettings): void {
			const oldMaterial = mesh.material
			const material =
				settings.style === "cratered" ||
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
			render()
		},
		dispose(): void {
			resizeObserver.disconnect()
			canvas.removeEventListener("pointerdown", pointerDown)
			canvas.removeEventListener("pointermove", pointerMove)
			canvas.removeEventListener("pointerup", pointerUp)
			canvas.removeEventListener("pointercancel", pointerUp)
			geometry.dispose()
			mesh.material.dispose()
			renderer.dispose()
		},
	}
}
