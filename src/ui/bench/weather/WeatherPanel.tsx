import type { WeatherBenchPanelProps } from "@/ui/bench/weather/types"
import { cx } from "@/ui/components/lib"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiTokens } from "@/ui/components/tokens"
export function WeatherPanel({
	title,
	description,
	children,
}: WeatherBenchPanelProps) {
	return (
		<Surface
			padding="lg"
			borderTone="default"
			shadow="sm"
			className={uiTokens.bench.panel}
		>
			<div className={uiTokens.bench.heading}>
				<h2 className={uiTokens.type.title}>{title}</h2>
				<p className={cx(uiTokens.type.valueSm, uiTokens.text.muted)}>
					{description}
				</p>
			</div>
			{children}
		</Surface>
	)
}
