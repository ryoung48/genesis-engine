import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SLIDER_RANGES } from "@/model/pipelines/genesis-params/ranges"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { Slider } from "@/ui/components/primitives/Slider"
import { uiPalette } from "@/ui/components/tokens"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"

export function buildStarStats(params: {
	starClass: MainSequenceClass
	starSubtype: number
	setSpectralClass?: (value: string) => void
	setStarSubtype?: (value: number) => void
}): StatEntry[] {
	const { starClass, starSubtype, setSpectralClass, setStarSubtype } = params
	const typeStatValue = STAR.getStarLabel({
		cls: starClass,
		subtype: starSubtype,
	})
	const starTempK = Math.round(
		STAR.getStarTemperatureK({ cls: starClass, subtype: starSubtype }),
	)
	const starDiamSol = STAR.getStarDiameterSol({
		cls: starClass,
		subtype: starSubtype,
	}).toFixed(3)
	const starLuminosity = STAR.getStarLuminositySol({
		cls: starClass,
		subtype: starSubtype,
	})
	const starLumSol = starLuminosity.toFixed(3)
	const starMassSolValue = STAR.getStarMassSol({
		cls: starClass,
		subtype: starSubtype,
	})
	const starMassSol = starMassSolValue.toFixed(3)
	const starHzAU = STAR.getHabitableZoneAU(starLuminosity).toFixed(3)
	const starMaoAU = STAR.getStarMAO({
		cls: starClass,
		subtype: starSubtype,
	}).toFixed(3)
	const starAgeGyr = STAR_IDENTITY.getStarAgeGyr({
		massSol: starMassSolValue,
	}).toFixed(2)

	return [
		{
			label: "Type",
			value: typeStatValue,
			swatchColor: SPECTRAL_CLASS_COLORS[starClass],
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
										{STAR.mainSequenceClasses.map((spectralType) => {
											const color = SPECTRAL_CLASS_COLORS[spectralType]
											const active = spectralType === starClass
											return (
												<button
													key={spectralType}
													type="button"
													onClick={() => setSpectralClass(spectralType)}
													style={{
														backgroundColor: active ? color : undefined,
														borderColor: active
															? uiPalette.activeDark
															: undefined,
														color: active ? uiPalette.activeDark : undefined,
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
									<Slider
										label="Subtype"
										value={typeStatValue}
										min={SLIDER_RANGES.starSubtype.min}
										max={SLIDER_RANGES.starSubtype.max}
										step={SLIDER_RANGES.starSubtype.step}
										inputValue={starSubtype}
										onChange={setStarSubtype}
									/>
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
