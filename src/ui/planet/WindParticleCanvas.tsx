import React, { useCallback, useRef } from "react"
import { windSpeedColor } from "@/ui/planet/colors"
import {
	FlowParticleCanvas,
	type FlowSample,
} from "@/ui/planet/FlowParticleCanvas"
import type { WindGrid } from "@/model/climate/wind/types"

const NUM_PARTICLES = 3000
const MIN_LIFETIME = 80
const MAX_LIFETIME = 220
const SPEED_SCALE = 0.04
const TRAIL_ALPHA = 0.05

function randomLat() {
	return (Math.asin(Math.random() * 2 - 1) / (Math.PI / 2)) * 85
}

function randomLon() {
	return Math.random() * 360 - 180
}

interface WindParticleCanvasProps {
	windGrid: WindGrid | null
	projectToScreen: (
		xyz: [number, number, number],
		lonOffsetRad?: number,
	) => [number, number] | null
	getGlobeCameraDir: () => [number, number, number] | null
	visible: boolean
	viewMode: "globe" | "map"
}

export const WindParticleCanvas: React.FC<WindParticleCanvasProps> = ({
	windGrid,
	projectToScreen,
	getGlobeCameraDir,
	visible,
	viewMode,
}) => {
	const colorLUT = useRef<string[]>([])
	const getColor = useCallback((sample: FlowSample): string => {
		if (colorLUT.current.length === 0) {
			for (let i = 0; i <= 60; i++) {
				const [r, g, b] = windSpeedColor(i * 0.5)
				colorLUT.current.push(
					`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
				)
			}
		}
		const idx = Math.max(0, Math.min(60, Math.round(sample.speed * 2)))
		return colorLUT.current[idx]!
	}, [])

	return (
		<FlowParticleCanvas
			grid={windGrid}
			projectToScreen={projectToScreen}
			getGlobeCameraDir={getGlobeCameraDir}
			visible={visible}
			viewMode={viewMode}
			numParticles={NUM_PARTICLES}
			minLifetime={MIN_LIFETIME}
			maxLifetime={MAX_LIFETIME}
			speedScale={SPEED_SCALE}
			trailAlpha={TRAIL_ALPHA}
			calmSpeedThreshold={0.5}
			calmAgeBoost={3}
			getColor={getColor}
			randomPosition={() => ({ lat: randomLat(), lon: randomLon() })}
		/>
	)
}
