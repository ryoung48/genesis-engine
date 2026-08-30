import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { GALAXY_IDENTITY } from "@/model/celestial/galaxy/galaxy-identity"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { Galaxy, GalaxyParams } from "@/model/celestial/galaxy/types"
import type { GalaxyWorkerResponse } from "@/model/celestial/galaxy/worker-protocol/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { DetailsIcon } from "@/ui/components/primitives/icons/DetailsIcon"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import { GalaxyOverlayControls } from "@/ui/genesis/galaxy/controls/GalaxyOverlayControls"
import { GalaxyRenderer } from "@/ui/genesis/galaxy/renderer/GalaxyRendererThree"
import { updateClusterPositions } from "@/ui/genesis/galaxy/renderer/galaxy-scene/cluster"
import { buildGalaxyLanes } from "@/ui/genesis/galaxy/renderer/galaxy-scene/lanes"
import { buildNationOverlay } from "@/ui/genesis/galaxy/renderer/galaxy-scene/nation-overlay"
import { pickNearestSystem } from "@/ui/genesis/galaxy/renderer/galaxy-scene/picking"
import {
	BLACK_HOLE_POINT_SIZE_RATIO,
	buildGalaxyPoints,
} from "@/ui/genesis/galaxy/renderer/galaxy-scene/points"
import { recenterGalaxy } from "@/ui/genesis/galaxy/view/old-galaxy-overlay"
import {
	DEFAULT_PORTED_GALAXY_DISPLAY_FLAGS,
	DEFAULT_PORTED_GALAXY_PARAMS,
	densityWaveShapeFor,
	fromGalaxyParam,
	type PortedGalaxyDisplayFlags,
	type PortedGalaxyParams,
	toGalaxyParam,
} from "@/ui/genesis/galaxy/view/portedGalaxyParams"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"
import { PortedGalaxyPanel } from "@/ui/wiki/PortedGalaxyPanel"
import {
	atmosphereCategory,
	hydrosphereCategory,
	temperatureCategory,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"

const DEFAULT_SEED = 1
const DEFAULT_SYSTEM_COUNT = 2000
const MAJOR_RING_MINIMUM_WIDTH = 0.4
const SELECTED_SYSTEM_ZOOM_FACTOR = 12
const SELECTION_PULSE_COUNT = 2
const SELECTION_PULSE_DURATION_MS = 260
const SELECTION_PULSE_RADIUS_PX = 14

type SelectionPulse = {
	ring: THREE.LineLoop
	startedAt: number
}

function specialCircumstances(body: SystemBody): SpecialCircumstance[] {
	const circumstances: SpecialCircumstance[] = []
	if (body.trojan) circumstances.push("Trojan Orbit")
	if (body.rings) {
		const ringWidth =
			body.rings.outerRadiusRelative - body.rings.innerRadiusRelative
		circumstances.push(
			ringWidth >= MAJOR_RING_MINIMUM_WIDTH ? "Major Rings" : "Minor Rings",
		)
	}
	if (body.moons.some((moon) => moon.sizeClass === body.sizeClass)) {
		circumstances.push("Twin Moon")
	}
	if (body.beltOfIdx !== undefined) circumstances.push("Asteroid Body")
	return circumstances
}

function createWorker(
	onProgress: (label: string, pct: number) => void,
	onDone: (galaxy: Galaxy, systems: GalaxySystem[] | undefined) => void,
	onError: (message: string) => void,
): Worker {
	const worker = new Worker(
		new URL(
			"../../../../model/celestial/galaxy/galaxy.worker.ts",
			import.meta.url,
		),
		{ type: "module" },
	)
	worker.onmessage = (event: MessageEvent<GalaxyWorkerResponse>) => {
		const message = event.data
		if (message.type === "progress") {
			onProgress(message.label, message.pct)
			return
		}
		if (message.type === "done") {
			onDone(message.galaxy, message.systems)
			return
		}
		onError(message.message)
	}
	return worker
}

/** Mounts the user-supplied beltoforion.de renderer port (src/ui/genesis/
 * galaxy/renderer/GalaxyRendererThree.ts -- a three.js port of that codebase's
 * rendering layer, see its own doc comment) directly in a React component
 * tree. GalaxyRenderer drives its own requestAnimationFrame loop internally
 * once constructed, and its built-in shape presets (Classic Spiral, Grand
 * Design, ...) drive the decorative star field.
 *
 * Real playable systems come from a SEPARATE old-model Galaxy generated on
 * a worker (galaxy.worker.ts, same as the pre-port GalaxyModeView used) --
 * its packing is shaped to match whichever preset is currently selected
 * (see densityWaveShapeFor) so its systems visually trace the same spiral,
 * and its own points/lanes objects (renderer/galaxy-scene/points.ts +
 * lanes.ts, unmodified) are added directly into GalaxyRenderer's own
 * THREE.Scene/THREE.Camera -- not a separate renderer or a 2D canvas kept
 * in sync by hand, since it's now literally the same scene/camera.
 * Double-clicking one of those dots -- not an individual decorative star
 * particle -- is what actually opens a system (see handleDoubleClick),
 * since the old model gives real neighbors/hyperlanes/known system count
 * that a raw star-particle index never had. */
export const PortedGalaxyView: React.FC<{
	onOpenSystem?: (system: GalaxySystem) => void
}> = ({ onOpenSystem }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const rendererRef = useRef<GalaxyRenderer | null>(null)
	const workerRef = useRef<Worker | null>(null)
	const galaxyRef = useRef<Galaxy | null>(null)
	const pointsRef = useRef<ReturnType<typeof buildGalaxyPoints> | null>(null)
	const lanesRef = useRef<ReturnType<typeof buildGalaxyLanes> | null>(null)
	const nationOverlayRef = useRef<ReturnType<typeof buildNationOverlay> | null>(
		null,
	)
	const selectionPulseRef = useRef<SelectionPulse | null>(null)
	// points.ts's own uSize uniform (see its own doc comment) is a fixed
	// pixel size with no zoom attenuation, matching how the original
	// galaxy-scene module's OWN camera/controls worked -- but this renderer's
	// zoom range is much wider (0.15-8x, see GalaxyRendererThree's wheel
	// handler), so left alone the star map either disappears when zoomed out
	// or overwhelms the view zoomed in. Captured once per points rebuild
	// (computeGalaxyDensityScale's own baseline for this galaxy's system
	// count) and re-scaled by zoom every frame below, the same piecewise
	// curve used for the old 2D-canvas star overlay earlier in this view's
	// history (steep shrink below 1x, capped linear growth above it).
	const baseStarSizeRef = useRef(4)
	// Mirrors displayFlags.showStarOverlay -- read (not the state) inside
	// applyOldGalaxy's worker-callback closure so a freshly rebuilt overlay
	// always picks up the CURRENT toggle state rather than whatever it was
	// when that particular regenerate() call started.
	const showStarOverlayRef = useRef(
		DEFAULT_PORTED_GALAXY_DISPLAY_FLAGS.showStarOverlay,
	)
	// Same reasoning as showStarOverlayRef above -- read inside
	// applyOldGalaxy's worker-callback closure so a freshly rebuilt nation
	// overlay always picks up the current toggle state.
	const showNationOverlayRef = useRef(
		DEFAULT_PORTED_GALAXY_DISPLAY_FLAGS.showNationOverlay,
	)

	const [params, setParams] = useState(DEFAULT_PORTED_GALAXY_PARAMS)
	const [displayFlags, setDisplayFlags] = useState(
		DEFAULT_PORTED_GALAXY_DISPLAY_FLAGS,
	)
	const [presetCount, setPresetCount] = useState(0)
	const [selectedPresetIndex, setSelectedPresetIndex] = useState<number | null>(
		0,
	)
	const [panelOpen, setPanelOpen] = useState(true)
	const [timeStep, setTimeStep] = useState(0)

	const [seed, setSeed] = useState(DEFAULT_SEED)
	const [systemCount, setSystemCount] = useState(DEFAULT_SYSTEM_COUNT)
	const [generating, setGenerating] = useState(false)
	const [generationLabel, setGenerationLabel] = useState("")
	const [generationProgress, setGenerationProgress] = useState(0)
	const [galaxy, setGalaxyState] = useState<Galaxy | null>(null)
	const [pregenerateAllSystems, setPregenerateAllSystems] = useState(false)
	const [pregeneratedSystems, setPregeneratedSystems] = useState<
		GalaxySystem[] | null
	>(null)

	function disposeSelectionPulse() {
		const pulse = selectionPulseRef.current
		if (!pulse) return
		rendererRef.current?.scene.remove(pulse.ring)
		pulse.ring.geometry.dispose()
		;(pulse.ring.material as THREE.Material).dispose()
		selectionPulseRef.current = null
	}

	/** Swaps a freshly worker-generated old-model galaxy's points/lanes into
	 * the renderer's scene, disposing whatever was there before. */
	const applyOldGalaxy = (renderer: GalaxyRenderer, nextGalaxy: Galaxy) => {
		if (pointsRef.current) {
			renderer.scene.remove(pointsRef.current.points)
			pointsRef.current.points.geometry.dispose()
			;(pointsRef.current.points.material as THREE.Material).dispose()
			renderer.scene.remove(pointsRef.current.blackHolePoints)
			pointsRef.current.blackHolePoints.geometry.dispose()
			;(pointsRef.current.blackHolePoints.material as THREE.Material).dispose()
		}
		if (lanesRef.current) {
			renderer.scene.remove(lanesRef.current)
			lanesRef.current.geometry.dispose()
			;(lanesRef.current.material as THREE.Material).dispose()
		}
		if (nationOverlayRef.current) {
			renderer.scene.remove(nationOverlayRef.current.group)
			nationOverlayRef.current.dispose()
			nationOverlayRef.current = null
		}

		recenterGalaxy(nextGalaxy)
		galaxyRef.current = nextGalaxy
		const built = buildGalaxyPoints(nextGalaxy)
		baseStarSizeRef.current = (built.points.material as THREE.ShaderMaterial)
			.uniforms.uSize!.value
		const lanes = buildGalaxyLanes(nextGalaxy, [
			canvasRef.current?.clientWidth ?? 1,
			canvasRef.current?.clientHeight ?? 1,
		])
		lanes.visible = showStarOverlayRef.current
		built.points.visible = showStarOverlayRef.current
		built.blackHolePoints.visible = showStarOverlayRef.current
		renderer.scene.add(lanes)
		renderer.scene.add(built.points)
		renderer.scene.add(built.blackHolePoints)
		pointsRef.current = built
		lanesRef.current = lanes

		const nationOverlay = buildNationOverlay(nextGalaxy)
		nationOverlay.group.visible = showNationOverlayRef.current
		renderer.scene.add(nationOverlay.group)
		nationOverlayRef.current = nationOverlay
	}

	const regenerate = (shapeParams: PortedGalaxyParams) => {
		const radius = { min: shapeParams.coreRad, max: shapeParams.rad }
		workerRef.current?.terminate()
		setGenerating(true)
		setGenerationLabel("Starting...")
		setGenerationProgress(0)
		setPregeneratedSystems(null)
		console.time("[galaxy] worker create + generate")
		const worker = createWorker(
			(label, pct) => {
				setGenerationLabel(label)
				setGenerationProgress(pct)
			},
			(nextGalaxy, systems) => {
				console.timeEnd("[galaxy] worker create + generate")
				setGenerating(false)
				setGalaxyState(nextGalaxy)
				setPregeneratedSystems(systems ?? null)
				console.time("[galaxy] applyOldGalaxy (points/lanes build)")
				if (rendererRef.current) applyOldGalaxy(rendererRef.current, nextGalaxy)
				console.timeEnd("[galaxy] applyOldGalaxy (points/lanes build)")
			},
			(message) => {
				console.error("Galaxy worker failed", message)
				setGenerating(false)
				setGenerationLabel("Failed")
			},
		)
		workerRef.current = worker
		const dimensions = { w: radius.max * 4, h: radius.max * 4 }
		const workerParams: GalaxyParams = {
			size: systemCount,
			seed,
			radius,
			dimensions,
			pregenerateAllSystems,
			...densityWaveShapeFor(shapeParams, radius.max),
		}
		worker.postMessage({ type: "generate", params: workerParams })
	}

	const handleGenerate = () => {
		rendererRef.current?.applyParams(toGalaxyParam(params))
		regenerate(params)
	}

	const updateDensityWaveGuides = (nextParams: PortedGalaxyParams) => {
		rendererRef.current?.updateDensityWaveParam(toGalaxyParam(nextParams))
	}

	const handleParamsChange = (nextParams: PortedGalaxyParams) => {
		setParams(nextParams)
		setSelectedPresetIndex(null)
		updateDensityWaveGuides(nextParams)
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount only, seeding the freshly-constructed renderer from whatever displayFlags/params/seed/etc. state existed at that point -- it must NOT re-run (and reconstruct the whole renderer) whenever that state changes later.
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return

		console.time("[galaxy] GalaxyRenderer construction")
		const renderer = new GalaxyRenderer(canvas)
		console.timeEnd("[galaxy] GalaxyRenderer construction")
		rendererRef.current = renderer
		setPresetCount(renderer.presets.length)
		// Only density-wave guides and the star overlay are user-toggleable
		// (see displayFlags below) -- everything else GalaxyRenderer exposes
		// is pinned to a fixed value here rather than being panel-editable:
		// dust/filaments/H2/stars stay on, the axis grid and velocity curve
		// stay off, and the dark matter halo stays on regardless of what a
		// given preset's own GalaxyParam row specifies.
		renderer.showAxis = false
		renderer.showDensityWaves = displayFlags.showDensityWaves
		renderer.showGalaxy = displayFlags.showGalaxy
		renderer.showDust = true
		renderer.showDustFilaments = true
		renderer.showStars = true
		renderer.showH2 = true
		renderer.showVelocity = false
		renderer.hasDarkMatter = true
		// GalaxyRenderer's own constructor default (100,000) doesn't match this
		// view's default of paused (0) -- push the initial state in explicitly,
		// same reasoning as the flags above.
		renderer.timeStep = timeStep
		renderer.applyParams(toGalaxyParam(params))

		regenerate(params)

		const handleResize = () => {
			renderer.resize()
			if (lanesRef.current) {
				;(
					lanesRef.current.material as InstanceType<
						typeof import("three/examples/jsm/lines/LineMaterial.js").LineMaterial
					>
				).resolution.set(canvas.clientWidth, canvas.clientHeight)
			}
		}
		window.addEventListener("resize", handleResize)
		const ro = new ResizeObserver(handleResize)
		ro.observe(canvas)

		// The old scene's per-frame cluster-jitter update (multi-star
		// systems spreading apart at high zoom, collapsing together at low
		// zoom -- see cluster.ts) has no hook into GalaxyRenderer's own
		// internal render loop, so it runs its own lightweight rAF loop
		// alongside it, safely -- both just read/write the same THREE
		// objects already living in the shared scene.
		let clusterFrame = requestAnimationFrame(function updateCluster() {
			if (pointsRef.current) {
				const zoom = renderer.zoomFactor
				// Same piecewise curve settled on for the earlier 2D-canvas star
				// overlay: steep shrink below 1x zoom (zoom**2, floored so it
				// never fully vanishes) so zooming out reads as the whole map
				// getting smaller rather than snapping off, capped linear growth
				// above 1x so zooming in doesn't blow points up unboundedly.
				const sizeScale =
					zoom <= 1 ? Math.max(0.0005, zoom ** 2) : Math.min(4, zoom)
				const pointSizePx = baseStarSizeRef.current * sizeScale
				const material = pointsRef.current.points
					.material as THREE.ShaderMaterial
				material.uniforms.uSize!.value = pointSizePx
				const blackHoleMaterial = pointsRef.current.blackHolePoints
					.material as THREE.ShaderMaterial
				blackHoleMaterial.uniforms.uSize!.value =
					pointSizePx * BLACK_HOLE_POINT_SIZE_RATIO
				updateClusterPositions({
					geometry: pointsRef.current.points.geometry,
					clusterData: pointsRef.current.clusterData,
					camera: renderer.camera,
					canvasHeightPx: canvas.clientHeight,
					pointSizePx,
				})
			}
			const selectionPulse = selectionPulseRef.current
			if (selectionPulse) {
				const elapsed = performance.now() - selectionPulse.startedAt
				const totalDuration =
					SELECTION_PULSE_COUNT * SELECTION_PULSE_DURATION_MS
				if (elapsed >= totalDuration) {
					disposeSelectionPulse()
				} else {
					const phase =
						(elapsed % SELECTION_PULSE_DURATION_MS) /
						SELECTION_PULSE_DURATION_MS
					selectionPulse.ring.scale.setScalar(1 + phase * 0.8)
					;(selectionPulse.ring.material as THREE.LineBasicMaterial).opacity =
						1 - phase
				}
			}
			clusterFrame = requestAnimationFrame(updateCluster)
		})

		return () => {
			rendererRef.current = null
			cancelAnimationFrame(clusterFrame)
			window.removeEventListener("resize", handleResize)
			ro.disconnect()
			workerRef.current?.terminate()
			disposeSelectionPulse()
			if (nationOverlayRef.current) {
				renderer.scene.remove(nationOverlayRef.current.group)
				nationOverlayRef.current.dispose()
				nationOverlayRef.current = null
			}
			renderer.dispose()
		}
	}, [])

	const handleDisplayFlagChange = (
		key: keyof PortedGalaxyDisplayFlags,
		checked: boolean,
	) => {
		setDisplayFlags((cur) => ({ ...cur, [key]: checked }))
		if (key === "showDensityWaves") {
			const renderer = rendererRef.current
			if (renderer) renderer.showDensityWaves = checked
			return
		}
		if (key === "showGalaxy") {
			const renderer = rendererRef.current
			if (renderer) renderer.showGalaxy = checked
			return
		}
		if (key === "showNationOverlay") {
			showNationOverlayRef.current = checked
			if (nationOverlayRef.current)
				nationOverlayRef.current.group.visible = checked
			return
		}
		// showStarOverlay -- toggles the OLD packed-galaxy model's points/
		// lanes visibility directly, not any GalaxyRenderer property (its own
		// decorative stars stay on unconditionally, see the mount effect).
		showStarOverlayRef.current = checked
		if (pointsRef.current) pointsRef.current.points.visible = checked
		if (pointsRef.current) pointsRef.current.blackHolePoints.visible = checked
		if (lanesRef.current) lanesRef.current.visible = checked
	}

	const handleTimeStepChange = (value: number) => {
		const renderer = rendererRef.current
		setTimeStep(value)
		if (renderer) renderer.timeStep = value
	}

	const handleSelectPreset = (index: number) => {
		const renderer = rendererRef.current
		if (!renderer) return
		const preset = renderer.presets[index]
		if (!preset) return
		const nextParams = fromGalaxyParam(preset)
		nextParams.hasDarkMatter = true
		setParams(nextParams)
		setSelectedPresetIndex(index)
		updateDensityWaveGuides(nextParams)
	}

	const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
		const renderer = rendererRef.current
		const currentGalaxy = galaxyRef.current
		if (!renderer || !currentGalaxy || !onOpenSystem) return
		const [worldX, worldY] = renderer.screenToWorld(
			event.clientX,
			event.clientY,
		)
		const annularArea =
			Math.PI * (currentGalaxy.radius.max ** 2 - currentGalaxy.radius.min ** 2)
		const pickRadius =
			1.5 * 0.55 * Math.sqrt(annularArea / currentGalaxy.numSystems)
		const systemIndex = pickNearestSystem({
			galaxy: currentGalaxy,
			worldX,
			worldY,
			pickRadius,
		})
		if (systemIndex < 0 || currentGalaxy.r_edge[systemIndex]) return
		onOpenSystem(
			GALAXY_SYSTEMS.generate({
				galaxySeed: currentGalaxy.seed,
				systemIndex,
				nationIndex: currentGalaxy.nationAssignment[systemIndex] ?? -1,
				packed: currentGalaxy,
			}),
		)
	}

	const name = useMemo(() => GALAXY_IDENTITY.generateGalaxyName(seed), [seed])
	const systemSearchEntries = useMemo(
		() =>
			galaxy
				? Array.from({ length: galaxy.numSystems }, (_, systemIndex) => ({
						systemIndex,
						stars: GALAXY_SYSTEMS.previewStars({
							galaxySeed: galaxy.seed,
							systemIndex,
							packed: galaxy,
						}).map((star) => ({
							spectralClass: star.spectralClass,
							luminosityClass: star.luminosityClass,
							proto: star.ageGyr < 0.01 && star.massSol < 8,
							primordial: star.ageGyr < 0.1,
						})),
					}))
				: [],
		[galaxy],
	)
	const systemBodySearchEntries = useMemo(
		() =>
			pregeneratedSystems?.map((system) => ({
				systemIndex: system.systemIndex,
				planetClassifications: system.stars.flatMap((star) =>
					star.bodies.map((body) => body.classification),
				),
				moonClassifications: system.stars.flatMap((star) =>
					star.bodies.flatMap((body) =>
						body.moons.map((moon) => moon.classification),
					),
				),
				planetClassificationTemperaturePairs: system.stars.flatMap((star) =>
					star.bodies.map((body) => ({
						classification: body.classification,
						temperatureClass: temperatureCategory(body),
						hydrosphereClass: hydrosphereCategory(body),
						atmosphereClass: atmosphereCategory(body),
						specialCircumstances: specialCircumstances(body),
					})),
				),
				moonClassificationTemperaturePairs: system.stars.flatMap((star) =>
					star.bodies.flatMap((body) =>
						body.moons.map((moon) => ({
							classification: moon.classification,
							temperatureClass: temperatureCategory(moon),
							hydrosphereClass: hydrosphereCategory(moon),
							atmosphereClass: atmosphereCategory(moon),
							specialCircumstances: [] as SpecialCircumstance[],
						})),
					),
				),
			})) ?? null,
		[pregeneratedSystems],
	)

	const focusSearchedSystem = (systemIndex: number) => {
		const renderer = rendererRef.current
		const currentGalaxy = galaxyRef.current
		const canvas = canvasRef.current
		if (!renderer || !currentGalaxy || !canvas) return
		const worldX = currentGalaxy.r_xy[2 * systemIndex]!
		const worldY = currentGalaxy.r_xy[2 * systemIndex + 1]!
		renderer.panTo(worldX, worldY, SELECTED_SYSTEM_ZOOM_FACTOR)
		disposeSelectionPulse()
		const pulseRadius =
			((renderer.camera.top - renderer.camera.bottom) /
				(renderer.camera.zoom * Math.max(1, canvas.clientHeight))) *
			SELECTION_PULSE_RADIUS_PX
		const segments = 48
		const positions = new Float32Array(segments * 3)
		for (let index = 0; index < segments; index++) {
			const angle = (index / segments) * Math.PI * 2
			positions[3 * index] = Math.cos(angle) * pulseRadius
			positions[3 * index + 1] = Math.sin(angle) * pulseRadius
		}
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
		const ring = new THREE.LineLoop(
			geometry,
			new THREE.LineBasicMaterial({
				color: 0x22c55e,
				transparent: true,
				opacity: 1,
				depthTest: false,
			}),
		)
		ring.position.set(worldX, worldY, 0)
		ring.renderOrder = 4
		renderer.scene.add(ring)
		selectionPulseRef.current = { ring, startedAt: performance.now() }
	}

	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{panelOpen ? (
				<PortedGalaxyPanel
					name={name}
					seed={seed}
					setSeed={setSeed}
					systemCount={systemCount}
					setSystemCount={setSystemCount}
					params={params}
					onParamsChange={handleParamsChange}
					generating={generating}
					generationLabel={generationLabel}
					generationProgress={generationProgress}
					pregenerateAllSystems={pregenerateAllSystems}
					setPregenerateAllSystems={setPregenerateAllSystems}
					pregeneratedSystems={pregeneratedSystems}
					onGenerate={handleGenerate}
					onClose={() => setPanelOpen(false)}
					systemSearchEntries={systemSearchEntries}
					systemBodySearchEntries={systemBodySearchEntries}
					onFocusSystem={focusSearchedSystem}
					presetCount={presetCount}
					selectedPresetIndex={selectedPresetIndex}
					onSelectPreset={handleSelectPreset}
				/>
			) : null}
			<div
				className="flex-1 relative overflow-hidden"
				// GalaxyRenderer's WebGLRenderer clears with alpha=0 (see its own
				// constructor), so this container's background shows through
				// everywhere the WebGL content doesn't cover. The reference page
				// just uses a flat navy body background-color (dist/spiral-
				// galaxy-renderer.html) behind a small fixed-size canvas, which
				// reads fine there -- but our canvas is full-bleed, so a flat navy
				// fill all the way to the edges felt too uniform. Fading it to
				// black at the edges keeps the navy lift near the galaxy itself
				// without tinting the whole panel.
				style={{
					background:
						"radial-gradient(ellipse at center, #00001a 0%, #000000 75%)",
				}}
			>
				<canvas
					id="cvGalaxy"
					ref={canvasRef}
					onDoubleClick={handleDoubleClick}
					className="absolute inset-0 h-full w-full"
				/>
				<GalaxyOverlayControls
					displayFlags={displayFlags}
					onDisplayFlagChange={handleDisplayFlagChange}
					timeStep={timeStep}
					onTimeStepChange={handleTimeStepChange}
				/>
				{!panelOpen ? (
					<div className="absolute top-3 left-3 pointer-events-auto z-20">
						<Tooltip content="Show generation panel" position="bottom">
							<IconButton
								onClick={() => setPanelOpen(true)}
								tone="overlay"
								size="sm"
							>
								<DetailsIcon className="h-4 w-4 text-white" />
							</IconButton>
						</Tooltip>
					</div>
				) : null}
			</div>
		</div>
	)
}
