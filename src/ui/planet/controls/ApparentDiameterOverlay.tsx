import React, { useMemo } from "react"
import type { MoonBody, TideLock } from "@/model/celestial/moons/moon-types"
import {
	AU_M,
	derivePlanetMassKg,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import type { MainSequenceClass } from "@/model/celestial/star/star-types"
import {
	getStarDiameterSol,
	isValidSpectralClass,
} from "@/model/celestial/star/star-types"
import { SPECTRAL_CLASS_COLORS } from "../screen/generation/star-utils"

const MOON_COLORS = ["#0ea5e9", "#8b5cf6", "#10b981"]
const SOL_DIAMETER_KM = 1_392_700
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

function angularDiameterArcmin(diameterKm: number, distanceKm: number): number {
	return 2 * Math.atan2(diameterKm, 2 * distanceKm) * (180 / Math.PI) * 60
}

function moonDistanceKm(moon: MoonBody, smaM: number, day: number): number {
	const e = moon.eccentricity
	const n = TWO_PI / moon.orbitalPeriodDays
	const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180
	const M = mod2pi(M0 + n * day)
	const E = solveKepler(M, e)
	return (smaM * (1 - e * Math.cos(E))) / 1000
}

interface ApparentDiameterOverlayProps {
	moons: MoonBody[]
	planetRadiusKm: number
	hoursPerDay: number
	day: number
	orbitalDistanceAU: number
	spectralClass: string
	starSubtype: number
	useAverageDistance: boolean
	tideLock: TideLock | null
}

export const ApparentDiameterOverlay: React.FC<
	ApparentDiameterOverlayProps
> = ({
	moons,
	planetRadiusKm,
	hoursPerDay,
	day,
	orbitalDistanceAU,
	spectralClass,
	starSubtype,
	useAverageDistance,
	tideLock,
}) => {
	const bodies = useMemo(() => {
		const cls = isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: "G"
		const starDiamKm = getStarDiameterSol(cls, starSubtype) * SOL_DIAMETER_KM
		const starDistKm = orbitalDistanceAU * (AU_M / 1000)
		const starArcmin = angularDiameterArcmin(starDiamKm, starDistKm)
		const starColor = SPECTRAL_CLASS_COLORS[cls]

		const result: Array<{
			label: string
			arcmin: number
			color: string
			isStar: boolean
		}> = [{ label: "★", arcmin: starArcmin, color: starColor, isStar: true }]

		if (moons.length > 0) {
			const planetMassKg = derivePlanetMassKg(planetRadiusKm)
			const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
				hoursPerDay,
				tideLock,
			)
			for (let i = 0; i < moons.length; i++) {
				const moon = moons[i]
				const smaM = moonSemiMajorAxisM(
					moon,
					planetMassKg,
					moonOrbitHoursPerDay,
				)
				const distKm = useAverageDistance
					? smaM / 1000
					: moonDistanceKm(moon, smaM, day)
				const arcmin = angularDiameterArcmin(moon.diameterKm, distKm)
				result.push({
					label: `M${i + 1}`,
					arcmin,
					color: MOON_COLORS[i % MOON_COLORS.length],
					isStar: false,
				})
			}
		}

		return result
	}, [
		moons,
		planetRadiusKm,
		hoursPerDay,
		day,
		orbitalDistanceAU,
		spectralClass,
		starSubtype,
		tideLock,
		useAverageDistance,
	])

	const maxArcmin = Math.max(...bodies.map((b) => b.arcmin))
	const MAX_R = 28
	const MIN_R = 3
	const PAD = 10

	return (
		<div className="rounded-lg overflow-hidden border border-white/10 bg-slate-950/85 backdrop-blur-sm select-none">
			<div className="px-2.5 py-1.5 border-b border-white/8">
				<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
					Apparent Size
				</span>
			</div>
			<div className="flex items-end gap-3 px-3 py-2">
				{bodies.map((b, i) => {
					const r = Math.max(MIN_R, (b.arcmin / maxArcmin) * MAX_R)
					const arcminStr =
						b.arcmin >= 1
							? `${b.arcmin.toFixed(1)}′`
							: `${(b.arcmin * 60).toFixed(0)}″`
					const svgSize = MAX_R * 2 + PAD
					const c = svgSize / 2
					return (
						<div key={i} className="flex flex-col items-center gap-0.5">
							<svg width={svgSize} height={svgSize}>
								{b.isStar && (
									<circle
										cx={c}
										cy={c}
										r={r + 5}
										fill={b.color}
										fillOpacity={0.1}
									/>
								)}
								<circle
									cx={c}
									cy={c}
									r={r}
									fill={b.color}
									fillOpacity={b.isStar ? 0.9 : 0.75}
								/>
							</svg>
							<span className="text-[8px] font-mono" style={{ color: b.color }}>
								{b.label}
							</span>
							<span className="text-[8px] font-mono text-slate-500">
								{arcminStr}
							</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}
