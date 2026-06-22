import React, { useMemo } from "react"
import type { GasGiantSystem } from "@/model/celestial/moons/moon-types"

const TWO_PI = 2 * Math.PI

function solveKepler(M: number, e: number): number {
	let E = M
	for (let i = 0; i < 50; i++) {
		const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E))
		E += dE
		if (Math.abs(dE) < 1e-12) break
	}
	return E
}

function mod2pi(angle: number): number {
	return ((angle % TWO_PI) + TWO_PI) % TWO_PI
}

interface GasGiantSystemOverlayProps {
	gasGiantSystem: GasGiantSystem
	planetRadiusKm: number
	day: number
}

export const GasGiantSystemOverlay: React.FC<GasGiantSystemOverlayProps> = ({
	gasGiantSystem,
	day,
}) => {
	const SIZE = 230
	const GAS_GIANT_R = 16
	const MARGIN = 10
	const COL_W = 28
	const ROW_H = 12
	const COLS = Math.floor(SIZE / COL_W)
	// Count total orbits to compute legend rows (computed outside useMemo so SVG height is stable)
	const totalOrbits = 1 + gasGiantSystem.siblingMoons.length
	const legendRows = Math.ceil(totalOrbits / COLS)
	const LEGEND_H = 6 + legendRows * ROW_H
	const DIAGRAM_SIZE = SIZE
	const cx = SIZE / 2
	// Shift center up to leave room for legend
	const cy = (DIAGRAM_SIZE - LEGEND_H) / 2

	const { gasGiant, mainMoonPd, mainMoonOrbitalPeriodDays, siblingMoons } =
		gasGiantSystem

	const orbits = useMemo(() => {
		// Scale by apoapsis = pd*(1+e) so no orbit exceeds available radius
		const apoapsisMain = mainMoonPd // main moon has e=0
		const apoapsisSiblings = siblingMoons.map(
			(m) => m.pd * (1 + m.eccentricity),
		)
		const maxApoapsis = Math.max(apoapsisMain, ...apoapsisSiblings, 1)

		// Available radius from gas-giant center to SVG edge (with margin)
		const availR = Math.min(cx - MARGIN, cy - MARGIN) - GAS_GIANT_R

		// Semi-major axis in display pixels such that apoapsis = pd*(1+e)/maxApoapsis*availR + GAS_GIANT_R ≤ availR+GAS_GIANT_R
		function smaDisplay(pd: number): number {
			return (pd / maxApoapsis) * availR + GAS_GIANT_R
		}

		const mainOrbit = {
			a: smaDisplay(mainMoonPd),
			e: 0,
			b: smaDisplay(mainMoonPd),
			ae: 0,
			omegaDeg: 0,
			period: mainMoonOrbitalPeriodDays,
			M0: 0,
			color: "#60a5fa",
			bodyR: 4.5,
			label: "M",
			isMain: true,
		}

		const SIBLING_COLORS = [
			"#94a3b8",
			"#a78bfa",
			"#34d399",
			"#f472b6",
			"#fb923c",
			"#fbbf24",
		]
		const siblingOrbits = siblingMoons.map((moon, i) => {
			const e = moon.eccentricity
			const rawA = smaDisplay(moon.pd)
			const minA = e < 1 ? GAS_GIANT_R / (1 - e) : rawA
			const a = Math.max(rawA, minA)
			const b = a * Math.sqrt(1 - e * e)
			const ae = a * e
			return {
				a,
				e,
				b,
				ae,
				omegaDeg: moon.argumentOfPeriapsisDeg,
				period: moon.orbitalPeriodDays,
				M0: (moon.meanAnomalyAtEpochDeg * Math.PI) / 180,
				color: SIBLING_COLORS[i % SIBLING_COLORS.length] ?? "#94a3b8",
				bodyR: Math.max(1.5, Math.min(3.5, moon.diameterKm / 5000)),
				label: `S${i + 1}`,
				isMain: false,
			}
		})

		return [mainOrbit, ...siblingOrbits]
	}, [mainMoonPd, mainMoonOrbitalPeriodDays, siblingMoons, cx, cy])

	// Compute body positions at current day
	const positions = useMemo(() => {
		return orbits.map((o) => {
			const n = TWO_PI / Math.max(0.01, o.period)
			const M = mod2pi(o.M0 + n * day)
			const E = solveKepler(M, o.e)
			const r = o.a * (1 - o.e * Math.cos(E))
			const nu =
				2 *
				Math.atan2(
					Math.sqrt(1 + o.e) * Math.sin(E / 2),
					Math.sqrt(1 - o.e) * Math.cos(E / 2),
				)
			const omegaRad = (o.omegaDeg * Math.PI) / 180
			const posX = r * Math.cos(nu)
			const posY = r * Math.sin(nu)
			return {
				x: posX * Math.cos(omegaRad) - posY * Math.sin(omegaRad),
				y: posX * Math.sin(omegaRad) + posY * Math.cos(omegaRad),
			}
		})
	}, [orbits, day])

	const sizeLabel =
		gasGiant.sizeClass === 16
			? "Ice/Gas Giant"
			: gasGiant.sizeClass === 17
				? "Saturn-class"
				: "Jupiter-class"

	return (
		<div
			className="rounded-lg overflow-hidden border border-white/10 bg-slate-950/85 backdrop-blur-sm select-none"
			style={{ width: SIZE }}
		>
			<div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/8">
				<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
					Planetary System
				</span>
				<span className="text-[9px] font-mono text-amber-400">{sizeLabel}</span>
			</div>

			<svg width={SIZE} height={DIAGRAM_SIZE + LEGEND_H} className="block">
				{/* Star field — kept within orbit area */}
				{(
					[
						[30, 20],
						[180, 15],
						[55, 175],
						[200, 185],
						[15, 110],
						[215, 90],
						[100, 10],
						[165, 175],
						[45, 70],
						[195, 145],
					] as [number, number][]
				).map(([x, y], i) => (
					<circle
						key={i}
						cx={x}
						cy={y}
						r={0.8}
						fill="white"
						fillOpacity={0.25}
					/>
				))}

				{/* Orbit ellipses — gas giant at focus (origin of local frame) */}
				{orbits.map((o, i) => (
					<g key={i} transform={`translate(${cx}, ${cy})`}>
						<g transform={`rotate(${o.omegaDeg})`}>
							{/* Ellipse center offset by -ae so gas giant is at focus */}
							<ellipse
								cx={-o.ae}
								cy={0}
								rx={o.a}
								ry={o.b}
								fill="none"
								stroke={o.color}
								strokeWidth={o.isMain ? 1.2 : 0.7}
								strokeOpacity={o.isMain ? 0.55 : 0.28}
								strokeDasharray={o.isMain ? "4 2" : "2 3"}
							/>
						</g>
					</g>
				))}

				{/* Body positions */}
				{orbits.map((o, i) => {
					const pos = positions[i]!
					return (
						<g key={i} transform={`translate(${cx}, ${cy})`}>
							<circle
								cx={pos.x}
								cy={pos.y}
								r={o.bodyR * 1.8}
								fill={o.color}
								fillOpacity={0.15}
							/>
							<circle
								cx={pos.x}
								cy={pos.y}
								r={o.bodyR}
								fill={o.color}
								fillOpacity={0.9}
							/>
						</g>
					)
				})}

				{/* Gas giant body at center */}
				<circle
					cx={cx}
					cy={cy}
					r={GAS_GIANT_R + 3}
					fill="#78350f"
					fillOpacity={0.2}
				/>
				<circle cx={cx} cy={cy} r={GAS_GIANT_R} fill="#92400e" />
				{/* Atmospheric bands */}
				<line
					x1={cx - GAS_GIANT_R * 0.88}
					y1={cy - GAS_GIANT_R * 0.32}
					x2={cx + GAS_GIANT_R * 0.88}
					y2={cy - GAS_GIANT_R * 0.32}
					stroke="#a16207"
					strokeWidth={1.5}
					strokeOpacity={0.5}
				/>
				<line
					x1={cx - GAS_GIANT_R * 0.94}
					y1={cy + GAS_GIANT_R * 0.18}
					x2={cx + GAS_GIANT_R * 0.94}
					y2={cy + GAS_GIANT_R * 0.18}
					stroke="#a16207"
					strokeWidth={1}
					strokeOpacity={0.35}
				/>

				{/* Legend — wraps into rows of 8 items */}
				{orbits.map((o, i) => {
					const col = i % COLS
					const row = Math.floor(i / COLS)
					const x = 6 + col * COL_W
					const y = DIAGRAM_SIZE + 4 + row * ROW_H
					return (
						<g key={i}>
							<circle
								cx={x + 3}
								cy={y}
								r={2.5}
								fill={o.color}
								fillOpacity={0.85}
							/>
							<text
								x={x + 8}
								y={y + 4}
								fill={o.color}
								fontSize={7}
								fontFamily="monospace"
								fillOpacity={0.8}
							>
								{o.label}
							</text>
						</g>
					)
				})}
			</svg>
		</div>
	)
}
