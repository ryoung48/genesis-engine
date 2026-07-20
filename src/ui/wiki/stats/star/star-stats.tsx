import {
	getHabitableZoneAU,
	getStarDiameterSol,
	getStarLabel,
	getStarLuminositySol,
	getStarMAO,
	getStarMassSol,
	getStarTemperatureK,
	MAIN_SEQUENCE_CLASSES,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import { getStarAgeGyr } from "@/model/celestial/system/generate-system-bodies"
import { SLIDER_RANGES } from "@/model/shared/slider-ranges"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { SPECTRAL_CLASS_COLORS } from "../../../planet/screen/generation/star-utils"

export function buildStarStats(params: {
	starClass: MainSequenceClass
	starSubtype: number
	restSeed: number
	setSpectralClass?: (value: string) => void
	setStarSubtype?: (value: number) => void
}): StatEntry[] {
	const { starClass, starSubtype, restSeed, setSpectralClass, setStarSubtype } =
		params
	const typeStatValue = getStarLabel(starClass, starSubtype)
	const starTempK = Math.round(getStarTemperatureK(starClass, starSubtype))
	const starDiamSol = getStarDiameterSol(starClass, starSubtype).toFixed(3)
	const starLuminosity = getStarLuminositySol(starClass, starSubtype)
	const starLumSol = starLuminosity.toFixed(3)
	const starMassSolValue = getStarMassSol(starClass, starSubtype)
	const starMassSol = starMassSolValue.toFixed(3)
	const starHzAU = getHabitableZoneAU(starLuminosity).toFixed(3)
	const starMaoAU = getStarMAO(starClass, starSubtype).toFixed(3)
	const starAgeGyr = getStarAgeGyr(restSeed, starMassSolValue).toFixed(2)

	return [
		{
			label: "Type",
			value: typeStatValue,
			editor:
				setSpectralClass && setStarSubtype
					? {
							label: "Type",
							value: starSubtype,
							min: SLIDER_RANGES.starSubtype.min,
							max: SLIDER_RANGES.starSubtype.max,
							step: SLIDER_RANGES.starSubtype.step,
							display: typeStatValue,
							set: setStarSubtype,
							content: (
								<div className="flex w-56 flex-col gap-2 px-1 pt-0.5 pb-2">
									<div className="flex flex-wrap gap-1">
										{MAIN_SEQUENCE_CLASSES.map((spectralType) => {
											const color = SPECTRAL_CLASS_COLORS[spectralType]
											const active = spectralType === starClass
											return (
												<button
													key={spectralType}
													type="button"
													onClick={() => setSpectralClass(spectralType)}
													style={{
														backgroundColor: active ? color : undefined,
														borderColor: active ? "#0f172a" : undefined,
														color: active ? "#0f172a" : undefined,
													}}
													className={`rounded border px-2 py-0.5 text-[9px] font-bold transition-all ${
														active
															? ""
															: "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
													}`}
												>
													{spectralType}
												</button>
											)
										})}
									</div>
									<div className="flex flex-col gap-1">
										<div className="flex items-center justify-between">
											<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
												Subtype
											</span>
											<span className="font-mono text-[10px] text-slate-400">
												{typeStatValue}
											</span>
										</div>
										<input
											type="range"
											min={SLIDER_RANGES.starSubtype.min}
											max={SLIDER_RANGES.starSubtype.max}
											step={SLIDER_RANGES.starSubtype.step}
											value={starSubtype}
											onChange={(event) =>
												setStarSubtype(parseFloat(event.target.value))
											}
											className="mt-1 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
										/>
									</div>
								</div>
							),
						}
					: undefined,
		},
		{ label: "Diameter", value: `${starDiamSol} R☉` },
		{ label: "Mass", value: `${starMassSol} M☉` },
		{ label: "Temperature", value: `${starTempK.toLocaleString()} K` },
		{ label: "Luminosity", value: `${starLumSol} L☉` },
		{ label: "HZ Center", value: `${starHzAU} AU` },
		{ label: "MAO", value: `${starMaoAU} AU` },
		{ label: "Age", value: `${starAgeGyr} Gyr` },
		{ label: "Inclination", value: "0.0°" },
	]
}
