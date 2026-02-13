import { mean } from "d3"
import React from "react"
import { WORLD } from "@/model"
import { CELL } from "@/model/cells"
import { TEMPERATURE } from "@/model/cells/temperature"
import { WEATHER } from "@/model/cells/weather"
import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { MATH } from "@/model/utilities/math"
import { MAP_METRICS } from "../shapes/metrics"

interface StatsCardProps {
	province: Province
	cursor: { x: number; y: number }
	time: number
}

function decimalToDMS(lat: number, lon: number): string {
	const convert = (decimalDegree: number, isLatitude: boolean): string => {
		const degree: number = Math.floor(decimalDegree)
		const direction = isLatitude
			? decimalDegree >= 0
				? "N"
				: "S"
			: decimalDegree >= 0
				? "E"
				: "W"
		return `${Math.abs(degree)}° ${direction}`
	}
	return `${convert(lat, true)},  ${convert(lon, false)}`
}

export const StatsCard: React.FC<StatsCardProps> = ({
	province,
	cursor,
	time,
}) => {
	const curr = window.world.cells[province.cell]
	const nation =
		NATION.rebels.overlord(province, time) ?? PROVINCE.nation(province, time)
	const occupation = PROVINCE.occupations.get(province, time)
	const rebel = NATION.rebels.active(province, time)
	const occupant =
		rebel && !occupation
			? PROVINCE.nation(province, time)
			: occupation && !rebel
				? occupation.attacker === nation.idx
					? window.world.provinces[occupation.defender]
					: window.world.provinces[occupation.attacker]
				: null
	const desolate = province.desolate

	// Calculate current month from time (0-11)
	const currentMonth = new Date(time).getMonth()
	const monthName = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	][currentMonth]

	// Get monthly values
	const monthlyTemp = TEMPERATURE.monthly.mean({
		cell: curr,
		month: currentMonth,
	})
	const monthlyRain = WEATHER.rain.month({ cell: curr, month: currentMonth })

	return (
		<div className="absolute top-4 left-4 bg-white border border-slate-200 p-4 shadow-sm text-slate-900 min-w-[220px] rounded-none">
			<div className="mb-3 pb-2 border-b border-slate-200">
				<h3 className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
					COORDINATES — {monthName}
				</h3>
				<p className="font-mono text-sm font-bold text-slate-900">
					{decimalToDMS(cursor.y, cursor.x)}
				</p>
			</div>

			<div className="space-y-1.5">
				<div className="flex justify-between items-center text-[12px]">
					<span className="font-mono text-slate-400 uppercase tracking-wide">
						Climate
					</span>
					<div className="flex items-center gap-2">
						<div
							className="w-2 h-2 border border-black/10"
							style={{
								backgroundColor: MAP_METRICS.climate.tempColor(
									mean(
										province.cells.land.map(
											(c) => window.world.cells[c].heat.mean,
										),
									) || 0,
								),
							}}
						/>
						<span className="font-mono font-bold text-slate-900 capitalize">
							{curr.climate}
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center text-[12px]">
					<span className="font-mono text-slate-400 uppercase tracking-wide">
						Vegetation
					</span>
					<div className="flex items-center gap-2">
						<div
							className="w-2 h-2 border border-black/10"
							style={{
								backgroundColor:
									MAP_METRICS.vegetation.color[
										curr.vegetation as keyof typeof MAP_METRICS.vegetation.color
									] || "#bcbcbc",
							}}
						/>
						<span className="font-mono font-bold text-slate-900 capitalize">
							{curr.vegetation}
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center text-[12px]">
					<span className="font-mono text-slate-400 uppercase tracking-wide">
						Topography
					</span>
					<div className="flex items-center gap-2">
						<div
							className="w-2 h-2 border border-black/10"
							style={{
								backgroundColor:
									curr.topography === "marsh"
										? MAP_METRICS.terrain.categorical.marsh
										: curr.topography === "coastal"
											? "hsla(157, 21%, 57%, 1)"
											: MAP_METRICS.terrain.color(
													WORLD.elevation.heightToKM(
														mean(
															province.cells.land.map(
																(c) => window.world.cells[c].h,
															),
														) || 0,
													),
												),
							}}
						/>
						<span className="font-mono font-bold text-slate-900 capitalize">
							{curr.topography}
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center text-[12px]">
					<span className="font-mono text-slate-400 uppercase tracking-wide">
						Ocean Dist
					</span>
					<div className="flex items-center gap-2">
						<span className="font-mono font-bold text-slate-900">
							{MATH.conversion.distance.miles
								.km(CELL.distMiles(curr))
								.toFixed(0)}{" "}
							km
						</span>
					</div>
				</div>
				<div className="flex justify-between items-center text-[12px]">
					<span className="font-mono text-slate-400 uppercase tracking-wide">
						Temp
					</span>
					<div className="flex items-center gap-2">
						<div
							className="w-2 h-2 border border-black/10"
							style={{
								backgroundColor: MAP_METRICS.temperature.color(monthlyTemp),
							}}
						/>
						<span className="font-mono font-bold text-slate-900">
							{MAP_METRICS.temperature.format(monthlyTemp)}
						</span>
					</div>
				</div>
				{curr.rain?.annual !== undefined && curr.rain.annual >= 0 && (
					<div className="flex justify-between items-center text-[12px]">
						<span className="font-mono text-slate-400 uppercase tracking-wide">
							Precip
						</span>
						<div className="flex items-center gap-2">
							<div
								className="w-2 h-2 border border-black/10"
								style={{
									backgroundColor: MAP_METRICS.rain.color(monthlyRain),
								}}
							/>
							<span className="font-mono font-bold text-slate-900">
								{monthlyRain.toFixed(0)} mm
							</span>
						</div>
					</div>
				)}

				{!desolate && (
					<div className="my-2 border-t border-slate-200 pt-2">
						{province.culture !== -1 && (
							<div className="flex justify-between items-center text-[12px] mb-1">
								<span className="font-mono text-slate-400 uppercase tracking-wide">
									Culture
								</span>
								<div className="flex items-center gap-2">
									<div
										className="w-2 h-2 border border-black/10"
										style={{
											backgroundColor:
												window.world.cultures[province.culture]?.color ||
												"#bcbcbc",
										}}
									/>
									<span className="font-mono font-bold text-slate-900">
										#{window.world.cultures[province.culture]?.idx}
									</span>
								</div>
							</div>
						)}
						{province.heritage !== -1 && (
							<div className="flex justify-between items-center text-[12px] mb-1">
								<span className="font-mono text-slate-400 uppercase tracking-wide">
									Heritage
								</span>
								<div className="flex items-center gap-2">
									<div
										className="w-2 h-2 border border-black/10"
										style={{
											backgroundColor:
												window.world.heritages[province.heritage]?.color ||
												"#bcbcbc",
										}}
									/>
									<span className="font-mono font-bold text-slate-900">
										#{window.world.heritages[province.heritage]?.idx}
									</span>
								</div>
							</div>
						)}
						{province.faith !== -1 && (
							<div className="flex justify-between items-center text-[12px] mb-1">
								<span className="font-mono text-slate-400 uppercase tracking-wide">
									Faith
								</span>
								<div className="flex items-center gap-2">
									<div
										className="w-2 h-2 border border-black/10"
										style={{
											backgroundColor:
												window.world.faiths[province.faith]?.color || "#bcbcbc",
										}}
									/>
									<span className="font-mono font-bold text-slate-900">
										#{window.world.faiths[province.faith]?.idx}
									</span>
								</div>
							</div>
						)}
						{province.religion !== -1 && (
							<div className="flex justify-between items-center text-[12px] mb-1">
								<span className="font-mono text-slate-400 uppercase tracking-wide">
									Religion
								</span>
								<div className="flex items-center gap-2">
									<div
										className="w-2 h-2 border border-black/10"
										style={{
											backgroundColor:
												window.world.religions[province.religion]?.color ||
												"#bcbcbc",
										}}
									/>
									<span className="font-mono font-bold text-slate-900">
										#{window.world.religions[province.religion]?.idx}
									</span>
								</div>
							</div>
						)}
					</div>
				)}

				{!desolate && (
					<div className="my-2 border-t border-slate-200 pt-2">
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Province
							</span>
							<div className="flex items-center gap-2">
								<div
									className="w-2 h-2 border border-black/10"
									style={{ backgroundColor: province.color || "#bcbcbc" }}
								/>
								<span className="font-mono font-bold text-slate-900">
									#{province.idx}
								</span>
							</div>
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Nation
							</span>
							<div className="flex items-center gap-2">
								<div
									className="w-2 h-2 border border-black/10"
									style={{ backgroundColor: nation.color || "#bcbcbc" }}
								/>
								<span className="font-mono font-bold text-slate-900">
									#{nation.idx}
								</span>
							</div>
						</div>
						{occupant && (
							<div className="flex justify-between items-center text-[12px] mb-1">
								<span className="font-mono text-slate-400 uppercase tracking-wide">
									{rebel ? "Rebels" : "Occupation"}
								</span>
								<div className="flex items-center gap-2">
									<div
										className="w-2 h-2 border border-black/10"
										style={{ backgroundColor: occupant.color || "#bcbcbc" }}
									/>
									<span className="font-mono font-bold text-red-600">
										#{occupant.idx}
									</span>
								</div>
							</div>
						)}
					</div>
				)}

				{!desolate && (
					<div className="my-2 border-t border-slate-200 pt-2">
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Production
							</span>
							<span className="font-mono font-bold text-slate-900">
								{NATION.wealth.raw(province).toFixed(1)}
							</span>
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Wealth
							</span>
							{(() => {
								const current = NATION.wealth.current({
									nation: province,
									time,
								})
								const optimal = NATION.wealth.optimal(province, time)
								const percent = optimal > 0 ? (current / optimal) * 100 : 0
								const color =
									percent >= 80
										? "text-green-600"
										: percent >= 50
											? "text-amber-600"
											: "text-red-600"
								return (
									<span className={`font-mono font-bold ${color}`}>
										{current.toFixed(1)} ({percent.toFixed(0)}%)
									</span>
								)
							})()}
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Rural
							</span>
							<span className="font-mono font-bold text-slate-900">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 1,
								}).format(PROVINCE.population.rural.get(province, time))}
							</span>
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Urban
							</span>
							<span className="font-mono font-bold text-slate-900">
								{new Intl.NumberFormat("en-US", {
									notation: "compact",
									maximumFractionDigits: 1,
								}).format(PROVINCE.population.urban.get(province, time))}
							</span>
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Density
							</span>
							<span className="font-mono font-bold text-slate-900">
								{MATH.conversion.area.sqMi
									.sqKm(PROVINCE.population.density(province, time))
									.toFixed(1)}
								/km²
							</span>
						</div>
						<div className="flex justify-between items-center text-[12px] mb-1">
							<span className="font-mono text-slate-400 uppercase tracking-wide">
								Development
							</span>
							<span className="font-mono font-bold text-slate-900">
								{PROVINCE.development.get(province, time).toFixed(2)}
							</span>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
