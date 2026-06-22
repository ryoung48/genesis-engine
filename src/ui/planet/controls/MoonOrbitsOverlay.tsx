import React, { useMemo } from "react"
import type { MoonParams } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
} from "@/model/celestial/moons/orbital-mechanics"
import { scaleClockDialHourToDayLength } from "../clock"
import {
	getMoonOrbitDistanceRelativeToPlanet,
	scaleMoonOrbitDistanceForDisplay,
	scaleMoonRadiusToPlanetVisualRadius,
} from "../moon-visual-scale"

const MOON_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981"]
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

interface MoonOrbitsOverlayProps {
	moons: MoonParams[]
	planetRadiusKm: number
	hoursPerDay: number
	day: number
	showDaylight?: boolean
	clockHour?: number
}

export const MoonOrbitsOverlay: React.FC<MoonOrbitsOverlayProps> = ({
	moons,
	planetRadiusKm,
	hoursPerDay,
	day,
	showDaylight = false,
	clockHour = 12,
}) => {
	const SIZE = 230
	const PLANET_R = 10
	const MARGIN = 18
	const cx = SIZE / 2
	const cy = SIZE / 2
	const scaledClockHour = scaleClockDialHourToDayLength(clockHour, hoursPerDay)

	const orbits = useMemo(() => {
		if (moons.length === 0) return []
		const planetMassKg = derivePlanetMassKg(planetRadiusKm)
		const maxExtentPlanetRadii = Math.max(
			...moons.map((m) =>
				getMoonOrbitDistanceRelativeToPlanet(
					moonSemiMajorAxisM(m, planetMassKg, hoursPerDay) *
						(1 + m.eccentricity),
					planetRadiusKm,
				),
			),
		)

		return moons.map((moon, i) => {
			const smaM = moonSemiMajorAxisM(moon, planetMassKg, hoursPerDay)
			const orbitalDistancePlanetRadii = getMoonOrbitDistanceRelativeToPlanet(
				smaM,
				planetRadiusKm,
			)
			const e = moon.eccentricity
			const a = scaleMoonOrbitDistanceForDisplay({
				orbitalDistancePlanetRadii,
				maxOrbitalDistancePlanetRadii: maxExtentPlanetRadii,
				minDisplayDistance: PLANET_R + 8,
				maxDisplayDistance: SIZE / 2 - MARGIN,
			})
			const b = a * Math.sqrt(1 - e * e)
			const ae = a * e
			const omegaDeg = moon.argumentOfPeriapsisDeg

			// Moon position at `day`
			const n = TWO_PI / moon.orbitalPeriodDays
			const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180
			const M = mod2pi(M0 + n * day)
			const E = solveKepler(M, e)
			// Position in unrotated orbital frame (periapsis = +x)
			const r = a * (1 - e * Math.cos(E))
			const nu =
				2 *
				Math.atan2(
					Math.sqrt(1 + e) * Math.sin(E / 2),
					Math.sqrt(1 - e) * Math.cos(E / 2),
				)
			const posX = r * Math.cos(nu)
			const posY = r * Math.sin(nu)
			const omegaRad = (omegaDeg * Math.PI) / 180
			const cosOmega = Math.cos(omegaRad)
			const sinOmega = Math.sin(omegaRad)
			const globalPosX = posX * cosOmega - posY * sinOmega
			const globalPosY = posX * sinOmega + posY * cosOmega
			const moonDistance = Math.hypot(globalPosX, globalPosY)
			const sunAngle =
				Math.PI + TWO_PI * (scaledClockHour / (hoursPerDay || 24))
			const sunDirX = Math.cos(sunAngle)
			const sunDirY = Math.sin(sunAngle)
			const moonDirX = moonDistance > 0 ? globalPosX / moonDistance : 0
			const moonDirY = moonDistance > 0 ? globalPosY / moonDistance : 0
			const illumination = Math.max(
				0,
				Math.min(1, (1 - (moonDirX * sunDirX + moonDirY * sunDirY)) / 2),
			)

			return {
				a,
				b,
				ae,
				omegaDeg,
				posX,
				posY,
				diameterKm: moon.diameterKm,
				color: MOON_COLORS[i % MOON_COLORS.length],
				illumination,
				sunDirX,
				sunDirY,
				period: moon.orbitalPeriodDays,
				label: `M${i + 1}`,
			}
		})
	}, [moons, hoursPerDay, day, planetRadiusKm, scaledClockHour])

	return (
		<div
			className="rounded-lg overflow-hidden border border-white/10 bg-slate-950/85 backdrop-blur-sm select-none"
			style={{ width: SIZE }}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-2.5 py-1.5 border-b border-white/8">
				<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
					Planetary System
				</span>
				<div className="flex gap-2">
					{orbits.map((o, i) => (
						<span
							key={i}
							className="text-[9px] font-mono"
							style={{ color: o.color }}
						>
							M{i + 1}
						</span>
					))}
				</div>
			</div>

			{/* Orbital diagram */}
			<svg width={SIZE} height={SIZE} className="block">
				{/* Faint background star field */}
				{[
					[30, 20],
					[180, 15],
					[55, 195],
					[200, 210],
					[15, 110],
					[215, 90],
					[100, 10],
					[165, 220],
					[45, 70],
					[195, 155],
				].map(([x, y], i) => (
					<circle
						key={i}
						cx={x}
						cy={y}
						r={0.8}
						fill="white"
						fillOpacity={0.25}
					/>
				))}

				{/* Orbits — rendered using SVG transform: rotate around planet */}
				{orbits.map((o, i) => (
					<g key={i} transform={`translate(${cx}, ${cy})`}>
						<g transform={`rotate(${o.omegaDeg})`}>
							{/* Orbit ellipse: planet at focus, ellipse center offset by -ae along +x */}
							<ellipse
								cx={-o.ae}
								cy={0}
								rx={o.a}
								ry={o.b}
								fill="none"
								stroke={o.color}
								strokeWidth={0.8}
								strokeOpacity={0.35}
								strokeDasharray="3 2"
							/>
							{/* Periapsis tick */}
							<line
								x1={o.a - o.ae - 3}
								y1={0}
								x2={o.a - o.ae + 3}
								y2={0}
								stroke={o.color}
								strokeWidth={0.8}
								strokeOpacity={0.5}
							/>
							{/* Moon body — size derived from live planetRadiusKm prop */}
							{((_r) => (
								<>
									<circle
										cx={o.posX}
										cy={o.posY}
										r={_r}
										fill={showDaylight ? "#334155" : o.color}
									/>
									{showDaylight ? (
										<circle
											cx={o.posX - o.sunDirX * _r * (1 - o.illumination)}
											cy={o.posY - o.sunDirY * _r * (1 - o.illumination)}
											r={Math.max(_r * (0.3 + o.illumination * 0.7), _r * 0.45)}
											fill={o.color}
											fillOpacity={0.9}
										/>
									) : null}
									{showDaylight ? (
										<circle
											cx={o.posX - o.sunDirX * _r * 0.45}
											cy={o.posY - o.sunDirY * _r * 0.45}
											r={Math.max(_r * 0.28, 0.75)}
											fill="#ffffff"
											fillOpacity={0.12 + o.illumination * 0.18}
										/>
									) : null}
									<circle
										cx={o.posX}
										cy={o.posY}
										r={_r * 1.8}
										fill={o.color}
										fillOpacity={0.15}
									/>
								</>
							))(
								Math.max(
									1.5,
									scaleMoonRadiusToPlanetVisualRadius(
										o.diameterKm,
										planetRadiusKm,
										PLANET_R,
									),
								),
							)}
						</g>
					</g>
				))}

				{/* Planet */}
				<circle
					cx={cx}
					cy={cy}
					r={PLANET_R + 2}
					fill="#1e3a5f"
					fillOpacity={0.4}
				/>
				<circle cx={cx} cy={cy} r={PLANET_R} fill="#334155" />
				<circle
					cx={cx}
					cy={cy}
					r={PLANET_R - 3}
					fill="#475569"
					fillOpacity={0.6}
				/>

				{moons.length === 0 && (
					<text
						x={cx}
						y={cy + 4}
						textAnchor="middle"
						fill="#64748b"
						fontSize={10}
						fontFamily="system-ui"
					>
						No moons
					</text>
				)}
			</svg>
		</div>
	)
}
