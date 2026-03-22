import { useState } from "react"
import { catchupDelay, LOADING_STEPS } from "../constants/app"
import { WORLD } from "../model"
import { HISTORY } from "../model/history"
import { SHAPER_CLIMATES } from "../model/shapers/climate"
import { SHAPER_CONTINENTS } from "../model/shapers/continents"
import { SHAPER_DISPLAY } from "../model/shapers/display"
import { SHAPER_PARTITIONS } from "../model/shapers/partitions"
import { SHAPER_MOUNTAINS } from "../model/shapers/topagraphy"
import { SHAPER_HEIGHTMAP } from "../model/shapers/heightmap"
import { TIME } from "../model/utilities/time"
import { LoadingStep, ViewState } from "../types/app"

export interface HeightmapPreset {
	url: string
	seaLevel: number
	resolution: number
}

function loadImageData(src: string): Promise<ImageData> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = "anonymous"
		img.onload = () => {
			const canvas = document.createElement("canvas")
			canvas.width = img.width
			canvas.height = img.height
			const ctx = canvas.getContext("2d")
			if (!ctx) { reject(new Error("Could not get canvas context")); return }
			ctx.drawImage(img, 0, 0)
			resolve(ctx.getImageData(0, 0, img.width, img.height))
		}
		img.onerror = () => reject(new Error("Failed to load image"))
		img.src = src
	})
}

interface WorldGenParams {
	seed: string
	obliquity: number
	eccentricity: number
	perihelion: number
	tSun: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	pressure: number
	radius: number
	heightmap?: HeightmapPreset
	setView: (view: ViewState) => void
}

export function useWorldGeneration() {
	const [loadingProgress, setLoadingProgress] = useState(0)
	const [currentStep, setCurrentStep] = useState<string>("")
	const [logs, setLogs] = useState<string[]>([])
	const [isExiting, setIsExiting] = useState(false)
	const [activeStepIndex, setActiveStepIndex] = useState(-1)
	const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())

	const addLog = (message: string) => {
		setLogs((prev) =>
			[
				...prev,
				`[${new Date().toISOString().split("T")[1].slice(0, 12)}] ${message}`,
			].slice(-8),
		)
	}

	const handleStartClick = async ({
		seed,
		obliquity,
		eccentricity,
		perihelion,
		tSun,
		hoursPerDay,
		daysPerYear,
		landFraction,
		pressure,
		radius,
		heightmap,
		setView,
	}: WorldGenParams) => {
		const worldSeed = seed.trim() || crypto.randomUUID().slice(0, 8)
		localStorage.setItem("chaos-machine-last-seed", worldSeed)

		// Fade out the landing page
		setIsExiting(true)
		await TIME.delay(500)

		setView("loading")
		setIsExiting(false)
		setLogs([])
		setCompletedSteps(new Set())
		setActiveStepIndex(-1)
		setLoadingProgress(0)
		addLog("INIT_SYSTEM_SEQUENCE_START")
		addLog(`SEED_HASH: ${worldSeed}`)
		await TIME.delay(200)

		const runStep = async (step: LoadingStep, index: number) => {
			setCurrentStep(step.name)
			setActiveStepIndex(index)
			addLog(`EXEC_MODULE: ${step.name.toUpperCase().replace(/ /g, "_")}`)
			setLoadingProgress(step.progress)
			// Yield to allow React to render the "Active" state before blocking the main thread
			await TIME.delay(50)
		}

		const completeStep = (index: number) => {
			setCompletedSteps((prev) => new Set(prev).add(index))
		}

		console.time("Continents")
		await runStep(LOADING_STEPS[0], 0)
		window.world = WORLD.spawn({
			seed: worldSeed,
			obliquity,
			eccentricity,
			perihelion,
			tSun,
			hoursPerDay,
			daysPerYear,
			landFraction,
			pressure,
			radius,
			resolution: heightmap?.resolution,
		})
		if (heightmap) {
			const imageData = await loadImageData(heightmap.url)
			SHAPER_HEIGHTMAP.continents(imageData, heightmap.seaLevel)
		} else {
			SHAPER_CONTINENTS.build(landFraction)
		}
		completeStep(0)
		console.timeEnd("Continents")
		await TIME.delay(catchupDelay)

		console.time("Mountains")
		await runStep(LOADING_STEPS[1], 1)
		if (heightmap) {
			SHAPER_HEIGHTMAP.topography()
		} else {
			SHAPER_MOUNTAINS.build()
		}
		completeStep(1)
		console.timeEnd("Mountains")
		await TIME.delay(catchupDelay)

		console.time("Climate")
		await runStep(LOADING_STEPS[2], 2)
		SHAPER_CLIMATES.build()
		completeStep(2)
		console.timeEnd("Climate")
		await TIME.delay(catchupDelay)

		console.time("Partitions")
		await runStep(LOADING_STEPS[3], 3)
		SHAPER_PARTITIONS.build()
		completeStep(3)
		console.timeEnd("Partitions")
		await TIME.delay(catchupDelay)

		console.time("History")
		await runStep(LOADING_STEPS[4], 4)
		HISTORY.init()
		completeStep(4)
		console.timeEnd("History")
		await TIME.delay(catchupDelay)

		console.time("Display")
		await runStep(LOADING_STEPS[5], 5)
		SHAPER_DISPLAY.build()
		completeStep(5)
		console.timeEnd("Display")
		await TIME.delay(catchupDelay)

		addLog("SYSTEM_READY")

		// Fade out loading screen
		setIsExiting(true)
		await TIME.delay(600)
		setView("complete")
		setIsExiting(false)
	}

	return {
		loadingProgress,
		currentStep,
		logs,
		isExiting,
		setIsExiting,
		activeStepIndex,
		completedSteps,
		handleStartClick,
	}
}
