import React, { useCallback, useRef } from "react"
import type { FlowGrid } from "@/model/climate/wind"
import { oceanCurrentColor } from "./colors"
import { FlowParticleCanvas, type FlowSample } from "./FlowParticleCanvas"

const NUM_PARTICLES = 2200
const MIN_LIFETIME = 90
const MAX_LIFETIME = 240
const SPEED_SCALE = 0.65
const TRAIL_ALPHA = 0.045
const MAX_SPAWN_ATTEMPTS = 32

function randomOceanPosition(grid: FlowGrid | null): {
	lat: number
	lon: number
} {
	if (grid?.mask) {
		for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
			const idx = Math.floor(Math.random() * grid.mask.length)
			if (grid.mask[idx] !== 1) continue
			const row = Math.floor(idx / grid.width)
			const col = idx % grid.width
			return {
				lat: row - 90 + (Math.random() - 0.5),
				lon: col - 180 + (Math.random() - 0.5),
			}
		}
	}
	return {
		lat: (Math.asin(Math.random() * 2 - 1) / (Math.PI / 2)) * 85,
		lon: Math.random() * 360 - 180,
	}
}

interface OceanCurrentParticleCanvasProps {
	currentGrid: FlowGrid | null
	projectToScreen: (
		xyz: [number, number, number],
		lonOffsetRad?: number,
	) => [number, number] | null
	getGlobeCameraDir: () => [number, number, number] | null
	visible: boolean
	viewMode: "globe" | "map"
}

export const OceanCurrentParticleCanvas: React.FC<
	OceanCurrentParticleCanvasProps
> = ({
	currentGrid,
	projectToScreen,
	getGlobeCameraDir,
	visible,
	viewMode,
}) => {
	const colorLUT = useRef<string[]>([])
	const getColor = useCallback((sample: FlowSample): string => {
		if (colorLUT.current.length === 0) {
			for (let i = 0; i <= 80; i++) {
				const [r, g, b] = oceanCurrentColor(i / 40 - 1)
				colorLUT.current.push(
					`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
				)
			}
		}
		const idx = Math.max(0, Math.min(80, Math.round((sample.scalar + 1) * 40)))
		return colorLUT.current[idx]!
	}, [])

	return (
		<FlowParticleCanvas
			grid={currentGrid}
			projectToScreen={projectToScreen}
			getGlobeCameraDir={getGlobeCameraDir}
			visible={visible}
			viewMode={viewMode}
			numParticles={NUM_PARTICLES}
			minLifetime={MIN_LIFETIME}
			maxLifetime={MAX_LIFETIME}
			speedScale={SPEED_SCALE}
			trailAlpha={TRAIL_ALPHA}
			calmSpeedThreshold={0.01}
			calmAgeBoost={6}
			getColor={getColor}
			randomPosition={randomOceanPosition}
		/>
	)
}
