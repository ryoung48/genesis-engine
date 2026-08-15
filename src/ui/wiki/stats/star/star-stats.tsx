import { STAR } from "@/model/celestial/star"
import type {
	HostStarAttributes,
	SpectralClass,
} from "@/model/celestial/star/types"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SLIDER_RANGES } from "@/model/pipelines/genesis-params/ranges"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { Slider } from "@/ui/components/primitives/Slider"
import { uiPalette } from "@/ui/components/tokens"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"

function formatCompactNumber(value: number): string {
	return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatStarAge(ageGyr: number): string {
	if (ageGyr < 0.001) return `${formatCompactNumber(ageGyr * 1_000_000)}k years`
	if (ageGyr < 1) return `${formatCompactNumber(ageGyr * 1_000)}M years`
	return `${formatCompactNumber(ageGyr)}B years`
}

export function buildStarStats(params: {
	starClass: SpectralClass
	starSubtype: number
	/** [JUSTIFICATION] Only generated galaxy hosts retain rolled physical
	 * attributes; manually authored main-sequence stars use lookup data. */
	hostStar?: HostStarAttributes
	setSpectralClass?: (value: string) => void
	setStarSubtype?: (value: number) => void
	setStarAgeGyr?: (value: number) => void
	/** The live, authoritative age (see SolarSystemState.star.ageGyr's doc) --
	 * always provided for a primary star; omitted for a companion, which falls
	 * back to hostStar.ageGyr/the rolled default below (companions aren't
	 * live-edited). */
	ageGyr?: number
	/** Distance from the star this one orbits -- a "semi-major axis" stat is
	 * only meaningful for a companion star (see CompanionStar's doc); the
	 * root/primary star of a system has no parent to be given one for.
	 * [JUSTIFICATION] Omitted by every caller describing a root star. */
	orbitalDistanceAU?: number
	/** [JUSTIFICATION] Only companion stars orbit a parent star. */
	eccentricity?: number
	/** [JUSTIFICATION] Only companion stars orbit a parent star. */
	inclinationDeg?: number
}): StatEntry[] {
	const {
		starClass,
		starSubtype,
		hostStar,
		setSpectralClass,
		setStarSubtype,
		setStarAgeGyr,
		ageGyr,
		orbitalDistanceAU,
		eccentricity,
		inclinationDeg,
	} = params
	const tableInput = {
		cls: starClass as (typeof STAR.mainSequenceClasses)[number],
		subtype: starSubtype,
	}
	const hasSubtype = STAR.isValidSpectralClass(starClass)
	const luminosityClass = hostStar?.luminosityClass ?? "V"
	const isGiant = STAR.isGiant(luminosityClass)
	const isDwarfWithoutLuminosityClass =
		STAR.isBrownDwarf(starClass) || starClass === "D"
	const isRemnantWithoutSubtype = starClass === "NS" || starClass === "BH"
	const typeStatValue = isRemnantWithoutSubtype
		? starClass
		: isDwarfWithoutLuminosityClass
			? `${starClass}${Math.round(starSubtype)}`
			: hasSubtype
			? `${starClass}${Math.round(starSubtype)} ${luminosityClass}`
			: `${starClass} ${luminosityClass}`
	const starTempK = Math.round(
		hostStar?.temperatureK ?? STAR.getStarTemperatureK(tableInput),
	)
	const starDiamSol = (
		hostStar?.diameterSol ?? STAR.getStarDiameterSol(tableInput)
	).toFixed(3)
	const starLuminosity =
		hostStar?.luminositySol ?? STAR.getStarLuminositySol(tableInput)
	const starLumSol = starLuminosity.toFixed(3)
	const starMassSolValue = hostStar?.massSol ?? STAR.getStarMassSol(tableInput)
	const starMassSol = starMassSolValue.toFixed(3)
	const starHzAU = STAR.getHabitableZoneAU(starLuminosity).toFixed(3)
	const starMaoAU = (hostStar?.mao ?? STAR.getStarMAO(tableInput)).toFixed(3)
	const starAgeGyrValue =
		ageGyr ??
		hostStar?.ageGyr ??
		STAR_IDENTITY.getStarAgeGyr({ massSol: starMassSolValue })
	const starAge = formatStarAge(starAgeGyrValue)
	const starAgeBoundsGyr = STAR_IDENTITY.getStarAgeBoundsGyr({
		massSol: starMassSolValue,
	})

	return [
		{
			label: "Type",
			value: typeStatValue,
			swatchColor: isGiant
				? uiPalette.giantStar
				: SPECTRAL_CLASS_COLORS[starClass],
			editor:
				hasSubtype && setSpectralClass && setStarSubtype && !hostStar
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
		...(orbitalDistanceAU !== undefined
			? [
					{
						label: "Semi-Major Axis",
						value: `${orbitalDistanceAU.toFixed(3)} AU`,
					},
				]
			: []),
		...(eccentricity !== undefined
			? [{ label: "Eccentricity", value: eccentricity.toFixed(4) }]
			: []),
		{ label: "Diameter", value: `${starDiamSol} R☉` },
		{ label: "Mass", value: `${starMassSol} M☉` },
		{ label: "Temperature", value: `${starTempK.toLocaleString()} K` },
		{ label: "Luminosity", value: `${starLumSol} L☉` },
		{ label: "HZ Center", value: `${starHzAU} AU` },
		{ label: "MAO", value: `${starMaoAU} AU` },
		{
			label: "Age",
			value: starAge,
			editor: setStarAgeGyr
				? {
						label: "Age",
						value: starAgeGyrValue,
						min: starAgeBoundsGyr.minGyr,
						max: starAgeBoundsGyr.maxGyr,
						step: starAgeBoundsGyr.stepGyr,
						display: starAge,
						set: setStarAgeGyr,
					}
				: undefined,
		},
		{ label: "Inclination", value: `${(inclinationDeg ?? 0).toFixed(1)}°` },
	]
}
