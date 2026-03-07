import React from "react"
import { TEMPERATURE } from "@/model/cells/temperature"

interface TemperatureScaleProps {
	tempMin: number
	tempMax: number
	colorFn?: (temp: number) => string
	unit?: string
}

export const TemperatureScale: React.FC<TemperatureScaleProps> = ({
	tempMin,
	tempMax,
	colorFn,
	unit = "°C",
}) => {
	const steps = 10
	const stepSize = (tempMax - tempMin) / steps
	const scale = Array.from(
		{ length: steps + 1 },
		(_, i) => tempMin + i * stepSize,
	)

	return (
		<div className="mt-4 flex flex-col gap-2 px-1">
			<div className="flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
				<span>
					{tempMin.toFixed(1)}
					{unit}
				</span>
				<span>
					{unit === "°C"
						? "Temperature"
						: unit === " W/m²"
							? "Insolation"
							: unit === " hrs"
								? "Daylight"
								: "Wind Speed"}{" "}
					Scale
				</span>
				<span>
					{tempMax.toFixed(1)}
					{unit}
				</span>
			</div>
			<div className="flex h-1.5 w-full overflow-hidden border border-slate-200">
				{scale.map((temp, i) => (
					<div
						key={i}
						className="flex-1"
						style={{
							backgroundColor: colorFn
								? colorFn(temp)
								: TEMPERATURE.color(temp),
						}}
					/>
				))}
			</div>
		</div>
	)
}
