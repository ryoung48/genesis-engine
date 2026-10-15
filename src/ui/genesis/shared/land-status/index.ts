import { PROVINCE_STATUS } from "@/model/history/record/status"
import type { ProvinceStatusName } from "@/model/history/record/status/types"
import { darkenPoliticalAtElevation } from "@/ui/genesis/shared/color-helpers"
import type {
	LandStatusColorParams,
	LandStatusLabelParams,
	PaintUninhabitedParams,
	Rgb,
	StatusAtParams,
} from "@/ui/genesis/shared/land-status/types"

const UNINHABITED: Rgb = [0.75, 0.75, 0.75]

const STATUS_COLORS: Record<ProvinceStatusName, Rgb> = {
	uninhabited: UNINHABITED,
	stateless: [1, 1, 1],
	state: [0.5, 0.5, 0.5],
	desolate: [0.35, 0.33, 0.32],
}

function color({ status }: LandStatusColorParams): Rgb {
	return [...STATUS_COLORS[status]]
}

function formatYear(year: number): string {
	return year < 0 ? `${-year} BCE` : `${year}`
}

function label({ status, settledYear }: LandStatusLabelParams): string {
	if (status === "uninhabited") return "Uninhabited"
	if (status === "stateless")
		return `Stateless · settled ${formatYear(settledYear)}`
	if (status === "desolate") return "Desolate"
	return "State"
}

function statusAt({
	provinceStatus,
	province,
}: StatusAtParams): ProvinceStatusName | null {
	return provinceStatus
		? PROVINCE_STATUS.nameOf({ code: provinceStatus[province] })
		: null
}

function paintUninhabited({
	rgb,
	provinceStatus,
	regionProvince,
	elevationKm,
}: PaintUninhabitedParams): Float32Array {
	const painted = rgb.slice()
	const gray = color({ status: "uninhabited" })
	for (let r = 0; r < regionProvince.length; r++) {
		const p = regionProvince[r]
		if (p < 0 || provinceStatus[p] !== PROVINCE_STATUS.code.uninhabited)
			continue
		const shaded = darkenPoliticalAtElevation(gray, elevationKm[r] ?? 0)
		painted[3 * r] = shaded[0]
		painted[3 * r + 1] = shaded[1]
		painted[3 * r + 2] = shaded[2]
	}
	return painted
}

export const LAND_STATUS = {
	color,
	label,
	statusAt,
	paintUninhabited,
}
