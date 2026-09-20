import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { APP_PATHS } from "@/app-routes"
import { Button } from "@/ui/components/primitives/Button"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiPalette, uiTokens } from "@/ui/components/tokens"
import { createPlanetPreview } from "@/ui/genesis/planet-renderer-experiment/preview"
import type {
	PlanetPreview,
	PlanetTextureStyle,
} from "@/ui/genesis/planet-renderer-experiment/types"
import { CLASSIFICATION_COLOR } from "@/ui/genesis/solar-system/overlay/constants"

const initialColor = `#${CLASSIFICATION_COLOR.helian!.toString(16).padStart(6, "0")}`
const initialMoonColor = uiPalette.moonHighland
const initialMartianColor = uiPalette.martianHighland
const initialSnowballColor = "#dcebf2"
const initialMeltballColor = "#ff8a3d"

export function PlanetRendererExperiment() {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const previewRef = useRef<PlanetPreview | null>(null)
	const [seed, setSeed] = useState(1)
	const [cloudColor, setCloudColor] = useState(initialColor)
	const [moonColor, setMoonColor] = useState<string>(initialMoonColor)
	const [martianColor, setMartianColor] = useState<string>(initialMartianColor)
	const [brownDwarfLColor, setBrownDwarfLColor] = useState<string>(
		uiPalette.brownDwarfL,
	)
	const [brownDwarfTColor, setBrownDwarfTColor] = useState<string>(
		uiPalette.brownDwarfT,
	)
	const [brownDwarfYColor, setBrownDwarfYColor] = useState<string>(
		uiPalette.brownDwarfY,
	)
	const [snowballColor, setSnowballColor] =
		useState<string>(initialSnowballColor)
	const [meltballColor, setMeltballColor] =
		useState<string>(initialMeltballColor)
	const [style, setStyle] = useState<PlanetTextureStyle>("cloudy")
	const isStarStyle =
		style === "sun" || style === "white-dwarf" || style === "neutron-star"
	const color =
		style === "cratered"
			? moonColor
			: style === "martian"
				? martianColor
				: style === "snowball"
					? snowballColor
					: style === "meltball"
						? meltballColor
						: style === "brown-dwarf-l"
							? brownDwarfLColor
							: style === "brown-dwarf-t"
								? brownDwarfTColor
								: style === "brown-dwarf-y"
									? brownDwarfYColor
									: cloudColor

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const preview = createPlanetPreview(canvas)
		previewRef.current = preview
		return () => {
			preview.dispose()
			previewRef.current = null
		}
	}, [])

	useEffect(() => {
		previewRef.current?.setSettings({ seed, color, style })
	}, [seed, color, style])

	return (
		<div className="flex h-full w-full flex-col bg-slate-950 text-white">
			<header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
				<div>
					<h1 className="text-sm font-semibold tracking-tight">
						Celestial texture experiment
					</h1>
					<p className={uiTokens.type.valueSm}>Drag to rotate the preview</p>
				</div>
				<Link
					to={APP_PATHS.tectonicLab}
					className="text-sm text-slate-400 hover:text-white"
				>
					Back to map
				</Link>
			</header>
			<main className="min-h-0 flex-1">
				<canvas
					ref={canvasRef}
					aria-label="Rotatable procedural celestial body preview"
					className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
				/>
			</main>
			<Surface
				tone="overlay"
				borderTone="inverse"
				radius="sm"
				padding="lg"
				className="flex items-center justify-center gap-5 border-t"
			>
				<Button
					tone="overlay"
					size="md"
					disabled={isStarStyle}
					onClick={() =>
						setSeed(
							(current) =>
								(current + Math.floor(Math.random() * 999) + 1) % 1_000,
						)
					}
				>
					Regenerate
				</Button>
				<label className="flex items-center gap-3 text-sm">
					<span>Texture</span>
					<select
						value={style}
						onChange={(event) =>
							setStyle(event.target.value as PlanetTextureStyle)
						}
						className="rounded-md border border-white/20 bg-slate-950 px-3 py-2 text-white"
					>
						<option value="cloudy">Cloudy</option>
						<option value="banded">Gas giant bands</option>
						<option value="sun">Sun shader</option>
						<option value="white-dwarf">D white dwarf</option>
						<option value="neutron-star">Neutron star</option>
						<option value="brown-dwarf-l">L brown dwarf</option>
						<option value="brown-dwarf-t">T brown dwarf</option>
						<option value="brown-dwarf-y">Y brown dwarf</option>
						<option value="venusian">Venusian haze</option>
						<option value="cratered">Cratered moon</option>
						<option value="snowball">Frozen snowball moon</option>
						<option value="meltball">Lava meltball</option>
						<option value="martian">Martian terrain</option>
					</select>
				</label>
				<label className="flex items-center gap-3 text-sm">
					<span>Base color</span>
					<input
						type="color"
						disabled={isStarStyle}
						value={color}
						onChange={(event) =>
							style === "cratered"
								? setMoonColor(event.target.value)
								: style === "martian"
									? setMartianColor(event.target.value)
									: style === "snowball"
										? setSnowballColor(event.target.value)
										: style === "meltball"
											? setMeltballColor(event.target.value)
											: style === "brown-dwarf-l"
												? setBrownDwarfLColor(event.target.value)
												: style === "brown-dwarf-t"
													? setBrownDwarfTColor(event.target.value)
													: style === "brown-dwarf-y"
														? setBrownDwarfYColor(event.target.value)
														: setCloudColor(event.target.value)
						}
						aria-label="Base color"
						className="h-9 w-12 cursor-pointer rounded-md border border-white/20 bg-transparent p-1"
					/>
				</label>
			</Surface>
		</div>
	)
}
