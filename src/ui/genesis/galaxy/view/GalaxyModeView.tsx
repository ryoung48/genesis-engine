import React, { useEffect, useMemo, useRef, useState } from "react"
import { GALAXY_IDENTITY } from "@/model/celestial/galaxy/galaxy-identity"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { Galaxy, GalaxyParams } from "@/model/celestial/galaxy/types"
import type { GalaxyWorkerResponse } from "@/model/celestial/galaxy/worker-protocol/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { DetailsIcon } from "@/ui/components/primitives/icons/DetailsIcon"
import { Tooltip } from "@/ui/components/primitives/Tooltip"
import {
	createGalaxyScene,
	disposeGalaxyScene,
	pickAtCanvasPoint,
	render,
	resize,
	setGalaxy,
	setHoveredSystem,
	zoomCameraToSystem,
} from "@/ui/genesis/galaxy/renderer/create-galaxy-scene"
import type { GalaxySceneContext } from "@/ui/genesis/galaxy/renderer/galaxy-scene/types"
import type { GalaxyOrigin } from "@/ui/genesis/generation/session-persistence"
import { GalaxyGenerationPanel } from "@/ui/wiki/GalaxyGenerationPanel"
import type { SpecialCircumstance } from "@/ui/wiki/galaxy-generation-panel/types"
import {
	atmosphereCategory,
	hydrosphereCategory,
	temperatureCategory,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"

const DEFAULT_SEED = 1
const DEFAULT_SYSTEM_COUNT = 2000
// Matches galaxy-gen's own defaults (CONSTANTS.W/H, GalaxyPage's radius) so
// the core glow/nebula proportions read the same as the old repo.
const DEFAULT_RADIUS = { min: 100, max: 300 }
const DEFAULT_DIMENSIONS = { w: 1600, h: 1600 }
const MAJOR_RING_MINIMUM_WIDTH = 0.4

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

/** Galaxy-scale view: owns its own canvas + three.js scene, drives galaxy
 * generation via a worker, and renders the floating generation/inspector
 * panels over it. Rendered by GenesisView in place of the globe/map/
 * solar-system canvas while galaxy mode is active -- only ever entered by
 * mounting at the `/galaxy` route (which starts GenesisView with galaxy mode
 * active), and exited via double-clicking a system. There is deliberately no
 * link back to the Sol/Earth "/" instance from here (or from there into
 * galaxy mode) -- the two routes are independent, unconnected experiences.
 * The `/galaxy` route mounts its own GenesisView instance with a
 * `sessionNamespace`, so its scene, worker, and localStorage session/view-
 * prefs are fully independent of the default "/" instance -- see
 * plans/galaxy-view-port.md. */
export const GalaxyModeView: React.FC<{
	/** Where this session last opened a system from, if any -- reused only to
	 * regenerate the exact same galaxy layout (seed/size/radius) on mount, so
	 * reloading /galaxy shows the same galaxy rather than a new random one.
	 * Deliberately NOT used to re-center the camera on that system -- opening
	 * this view (including via a bare page load/refresh) should always land
	 * centered on the galaxy, not silently jump to wherever you last looked. */
	initialGalaxyOrigin: GalaxyOrigin | null
	/** Double-clicking a system hands it straight to GenesisView, which loads
	 * it into its own solar-system state and exits galaxy mode -- no
	 * navigation/session-snapshot round trip needed, since this is the same
	 * component tree. */
	onOpenSystem: (system: GalaxySystem, galaxyParams: GalaxyParams) => void
}> = ({ initialGalaxyOrigin, onOpenSystem }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const sceneRef = useRef<GalaxySceneContext | null>(null)
	const workerRef = useRef<Worker | null>(null)

	const [seed, setSeed] = useState(
		initialGalaxyOrigin?.galaxyParams.seed ?? DEFAULT_SEED,
	)
	const [systemCount, setSystemCount] = useState(
		initialGalaxyOrigin?.galaxyParams.size ?? DEFAULT_SYSTEM_COUNT,
	)
	const [radiusMin, setRadiusMin] = useState(
		initialGalaxyOrigin?.galaxyParams.radius.min ?? DEFAULT_RADIUS.min,
	)
	const [radiusMax, setRadiusMax] = useState(
		initialGalaxyOrigin?.galaxyParams.radius.max ?? DEFAULT_RADIUS.max,
	)
	const [generating, setGenerating] = useState(false)
	const [generationLabel, setGenerationLabel] = useState("")
	const [generationProgress, setGenerationProgress] = useState(0)
	const [galaxy, setGalaxyState] = useState<Galaxy | null>(null)
	const [generationPanelOpen, setGenerationPanelOpen] = useState(true)
	const [pregenerateAllSystems, setPregenerateAllSystems] = useState(false)
	// Populated only when pregenerateAllSystems was on for the generation that
	// produced the current `galaxy` -- unnamed (see handleGenerate's
	// skipNaming). Not used to satisfy an actual system open (that always
	// re-generates with real names, see handleDoubleClick); feeds the
	// galaxy-wide body-stat distribution charts in GalaxyGenerationPanel,
	// which only need rolled bodies, not their flavor names. Cleared on every
	// new generate() call.
	const [pregeneratedSystems, setPregeneratedSystems] = useState<
		GalaxySystem[] | null
	>(null)

	useEffect(() => {
		if (!canvasRef.current) return
		const ctx = createGalaxyScene(canvasRef.current)
		sceneRef.current = ctx

		let frame = requestAnimationFrame(function loop() {
			render(ctx)
			frame = requestAnimationFrame(loop)
		})

		const handleResize = () => resize(ctx)
		window.addEventListener("resize", handleResize)
		const ro = new ResizeObserver(() => resize(ctx))
		ro.observe(canvasRef.current)

		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", handleResize)
			ro.disconnect()
			disposeGalaxyScene(ctx)
			sceneRef.current = null
		}
	}, [])

	useEffect(() => {
		if (!galaxy || !sceneRef.current) return
		setGalaxy(sceneRef.current, galaxy)
	}, [galaxy])

	const handleGenerate = (paramsOverride?: GalaxyParams) => {
		workerRef.current?.terminate()
		// Disabled until setGalaxy re-centers and re-enables it -- otherwise a
		// stray wheel/pan during this re-roll's async generation drifts the view
		// off-center before the new galaxy even renders (see createGalaxyScene's
		// initial controls.enabled = false for the same reasoning on first load).
		if (sceneRef.current) sceneRef.current.controls.enabled = false
		setGenerating(true)
		setGenerationLabel("Starting...")
		setGenerationProgress(0)
		setPregeneratedSystems(null)
		const worker = createWorker(
			(label, pct) => {
				setGenerationLabel(label)
				setGenerationProgress(pct)
			},
			(nextGalaxy, systems) => {
				setGenerating(false)
				setGalaxyState(nextGalaxy)
				setPregeneratedSystems(systems ?? null)
			},
			(message) => {
				console.error("Galaxy worker failed", message)
				setGenerating(false)
				setGenerationLabel("Failed")
			},
		)
		workerRef.current = worker
		const params: GalaxyParams = paramsOverride ?? {
			size: systemCount,
			seed,
			radius: { min: radiusMin, max: radiusMax },
			dimensions: DEFAULT_DIMENSIONS,
			pregenerateAllSystems,
		}
		worker.postMessage({ type: "generate", params })
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once on mount only, generating from whatever params this component was constructed with.
	useEffect(() => {
		handleGenerate(
			initialGalaxyOrigin
				? initialGalaxyOrigin.galaxyParams
				: {
						size: systemCount,
						seed,
						radius: { min: radiusMin, max: radiusMax },
						dimensions: DEFAULT_DIMENSIONS,
					},
		)
	}, [])

	useEffect(() => {
		return () => workerRef.current?.terminate()
	}, [])

	const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (!sceneRef.current) return
		const rect = event.currentTarget.getBoundingClientRect()
		const index = pickAtCanvasPoint(
			sceneRef.current,
			event.clientX - rect.left,
			event.clientY - rect.top,
		)
		setHoveredSystem(sceneRef.current, index)
	}

	const viewSystemInGenesis = (system: GalaxySystem) => {
		if (!galaxy) return
		const galaxyParams: GalaxyParams = {
			size: galaxy.numSystems,
			seed: galaxy.seed,
			radius: galaxy.radius,
			dimensions: galaxy.dimensions,
		}
		onOpenSystem(system, galaxyParams)
	}

	const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
		if (!sceneRef.current || !galaxy) return
		const rect = event.currentTarget.getBoundingClientRect()
		const index = pickAtCanvasPoint(
			sceneRef.current,
			event.clientX - rect.left,
			event.clientY - rect.top,
		)
		if (index < 0 || galaxy.r_edge[index]) return
		// Always a real (named) generate here, even if this system was already
		// pre-generated -- pregeneratedSystemsRef entries are unnamed (see
		// handleGenerate's skipNaming), so opening a system re-rolls its bodies
		// with real star/planet/moon names instead of reusing the placeholder.
		viewSystemInGenesis(
			GALAXY_SYSTEMS.generate({
				galaxySeed: galaxy.seed,
				systemIndex: index,
				packed: galaxy,
			}),
		)
	}

	// Derived straight from the seed via the proc-language generator (same
	// LANGUAGE.spawn/word.simple shape as a star's name) rather than
	// free-typed -- re-rolling the seed always re-rolls the name with it.
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
							// Ported from body/index.ts's inline proto/primordial
							// derivation (galaxy-gen's star.proto/star.primordial,
							// stars/index.ts) -- proto is a strict subset of primordial
							// (narrower age window, plus a mass cap), so a star can match
							// both.
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
				// Paired per-body (not flattened into a separate array) so a
				// classification+temperature search only matches a single body that
				// has BOTH, rather than any body with the classification plus any
				// (possibly different) body with the temperature.
				planetClassificationTemperaturePairs: system.stars.flatMap((star) =>
					star.bodies.map((body) => ({
						classification: body.classification,
						temperatureClass: temperatureCategory(body),
						hydrosphereClass: hydrosphereCategory(body),
						atmosphereClass: atmosphereCategory(body),
						specialCircumstances: specialCircumstances(body),
					})),
				),
				// Moons don't roll their own trojan orbits -- only top-level bodies
				// do (see generateSystemBodies' trojan pass) -- so this is always
				// false here.
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
		if (!sceneRef.current) return
		zoomCameraToSystem({ ctx: sceneRef.current, systemIndex })
		setHoveredSystem(sceneRef.current, systemIndex)
	}

	return (
		<div className="w-full h-full flex flex-col xl:flex-row bg-slate-100">
			{generationPanelOpen && (
				<GalaxyGenerationPanel
					name={name}
					seed={seed}
					setSeed={setSeed}
					systemCount={systemCount}
					setSystemCount={setSystemCount}
					radiusMin={radiusMin}
					setRadiusMin={setRadiusMin}
					radiusMax={radiusMax}
					setRadiusMax={setRadiusMax}
					generating={generating}
					generationLabel={generationLabel}
					generationProgress={generationProgress}
					pregenerateAllSystems={pregenerateAllSystems}
					setPregenerateAllSystems={setPregenerateAllSystems}
					pregeneratedSystems={pregeneratedSystems}
					onGenerate={() => handleGenerate()}
					onClose={() => setGenerationPanelOpen(false)}
					systemSearchEntries={systemSearchEntries}
					systemBodySearchEntries={systemBodySearchEntries}
					onFocusSystem={focusSearchedSystem}
				/>
			)}
			{/* max-xl:/xl: (not a bare h-[56vh] plus xl:h-full) so the two height
			rules are mutually exclusive by media query -- Tailwind doesn't
			guarantee an xl: variant of a named utility beats an unconditional
			arbitrary-value utility in generated source order, so a bare
			h-[56vh] alongside xl:h-full could win even at xl and squash the
			canvas (and therefore the centered camera) into a short strip. */}
			<div className="flex-1 max-xl:h-[56vh] xl:h-full relative overflow-hidden bg-[#050510]">
				<canvas
					ref={canvasRef}
					className="absolute inset-0 h-full w-full"
					onPointerMove={handlePointerMove}
					onDoubleClick={handleDoubleClick}
				/>
				{!generationPanelOpen && (
					<div className="absolute top-3 left-3 pointer-events-auto z-20">
						<Tooltip content="Show generation panel" position="bottom">
							<IconButton
								onClick={() => setGenerationPanelOpen(true)}
								tone="overlay"
								size="sm"
							>
								<DetailsIcon className="h-4 w-4 text-white" />
							</IconButton>
						</Tooltip>
					</div>
				)}
			</div>
		</div>
	)
}
