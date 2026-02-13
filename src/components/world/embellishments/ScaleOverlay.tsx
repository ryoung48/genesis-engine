import { GeoProjection, range } from "d3"
import React, { useImperativeHandle, useState } from "react"
import { MATH } from "@/model/utilities/math"

export type ScaleOverlayHandle = {
	update: (projection: GeoProjection) => void
}

type Props = {
	units?: "metric" | "imperial"
}

export const ScaleOverlay = React.forwardRef<ScaleOverlayHandle, Props>(
	({ units = "metric" }, ref) => {
		const [state, setState] = useState<{ width: number } | null>(null)

		useImperativeHandle(ref, () => ({
			update: (projection: GeoProjection) => {
				const len = 65
				const center = projection.translate()
				if (!center) return

				const p1 = projection.invert(center)
				let p2 = projection.invert([center[0] + len, center[1]])
				let multiplier = 1

				if (!p2) {
					p2 = projection.invert([center[0] + 1, center[1]])
					multiplier = len
				}

				if (p1 && p2) {
					const radians = MATH.distance.geo(p1, p2)
					const width = MATH.conversion.distance.miles.km(
						radians * window.world.radius * multiplier,
					)
					setState({ width })
				}
			},
		}))

		if (!state) return null

		const len = 65
		const { width } = state

		return (
			<div
				className="absolute pointer-events-none flex flex-col items-center bg-white p-2 border border-slate-200 left-1/2 -translate-x-1/2 rounded-none shadow-sm"
				style={{
					bottom: 100,
				}}
			>
				<div className="flex">
					{range(4).map((i) => {
						const value = width * (i + 1)
						const label =
							units === "metric"
								? `${value.toFixed(0)} km`
								: `${MATH.conversion.distance.km.miles(value).toFixed(0)} mi`

						return (
							<div
								key={i}
								className="relative flex flex-col items-center"
								style={{ width: len }}
							>
								{/* Label */}
								<span className="text-[10px] font-mono absolute -bottom-5 text-black whitespace-nowrap">
									{label}
								</span>
								{/* Bar */}
								<div className="flex w-full h-[6px] border border-black border-l-0 first:border-l">
									<div
										className="w-full h-full"
										style={{
											backgroundColor: i % 2 === 0 ? "black" : "white",
										}}
									/>
								</div>
							</div>
						)
					})}
				</div>
				<div className="h-4" /> {/* Spacer for labels */}
			</div>
		)
	},
)

ScaleOverlay.displayName = "ScaleOverlay"
