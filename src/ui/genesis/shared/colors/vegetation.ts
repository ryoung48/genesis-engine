import { PASTA } from "@/model/climate/pasta"
import { VEGETATION_WATER_BLUE } from "@/ui/genesis/shared/colors"

export function vegetationColor(biomeCode: number): [number, number, number] {
	return biomeBaseColors[biomeCode] ?? biomeBaseColors[0]
}

export function vegetationMapColor(
	biomeCode: number,
	climateZoneCode?: number,
): [number, number, number] {
	if (
		(climateZoneCode === ARCTIC_CLIMATE_ZONE ||
			climateZoneCode === SUBARCTIC_CLIMATE_ZONE) &&
		(biomeCode === 2 || biomeCode === 3)
	) {
		return COLD_OPEN_LAND_COLOR
	}
	return biomeMapColors[biomeCode] ?? biomeMapColors[0]
}

export function vegetationSatelliteColor(
	pastaClimateCode: number,
): [number, number, number] {
	const label = PASTA.pastaLabels[pastaClimateCode] ?? "ocean"
	const rgb = PASTA_SATELLITE_TRUE_COLOR[label]
	if (!rgb) return DEFAULT_PASTA_SATELLITE_OCEAN
	return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]
}

const biomeBaseColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[0xcc / 255, 0xc4 / 255, 0xbc / 255],
	[0xa0 / 255, 0xa6 / 255, 0x96 / 255],
	[0x8e / 255, 0x9a / 255, 0x82 / 255],
	[0x78 / 255, 0x80 / 255, 0x6a / 255],
	[0x52 / 255, 0x5c / 255, 0x4a / 255],
	[0x34 / 255, 0x44 / 255, 0x32 / 255],
]

const ARCTIC_CLIMATE_ZONE = 1

const SUBARCTIC_CLIMATE_ZONE = 2

const COLD_OPEN_LAND_COLOR: [number, number, number] = [
	0xca / 255,
	0xcd / 255,
	0xca / 255,
]

const biomeMapColors: [number, number, number][] = [
	VEGETATION_WATER_BLUE,
	[1, 1, 1],
	[0xee / 255, 0xe3 / 255, 0xd2 / 255],
	[0xf0 / 255, 0xed / 255, 0xe2 / 255],
	[0xc0 / 255, 0xe8 / 255, 0xd4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
	[0x94 / 255, 0xda / 255, 0xc4 / 255],
]

const PASTA_SATELLITE_TRUE_COLOR: Partial<
	Record<(typeof PASTA.pastaLabels)[number], [number, number, number]>
> = {
	// Pasta ocean classes use the satellite vegetation ocean palette.
	Ofi: [190, 208, 226], // permanent frozen ocean
	Ofd: [20, 30, 66], // seasonal frozen ocean
	Ofg: [20, 30, 66], // barren seasonal frozen ocean
	Og: [20, 30, 66], // barren ocean
	Oc: [20, 30, 66], // cool ocean
	Ot: [20, 30, 66], // tropical ocean
	Oh: [20, 30, 66], // hot ocean
	Or: [20, 30, 66], // torrid ocean
	Oe: [20, 30, 66], // extraseasonal ocean
	TUr: [41, 63, 13],
	TUrp: [42, 65, 16],
	TUf: [55, 74, 20],
	TUfp: [59, 80, 24],
	TUs: [75, 85, 33],
	TUsp: [89, 102, 47],
	TUA: [107, 105, 53],
	TUAp: [124, 116, 63],
	TQf: [59, 78, 23],
	TQfp: [54, 73, 24],
	TQs: [75, 80, 35],
	TQsp: [67, 76, 30],
	TQA: [107, 105, 53],
	TQAp: [124, 116, 63],
	TF: [78, 84, 66],
	TG: [98, 91, 59],
	CTf: [59, 78, 23],
	CTfp: [54, 73, 24],
	CTs: [75, 80, 35],
	CTsp: [67, 76, 30],
	CDa: [60, 78, 23],
	CDap: [36, 54, 15],
	CDb: [55, 75, 21],
	CDbp: [38, 62, 11],
	CEa: [60, 63, 29],
	CEap: [38, 52, 18],
	CEb: [49, 61, 18],
	CEbp: [52, 64, 25],
	CEc: [62, 71, 24],
	CEcp: [64, 74, 27],
	CMa: [60, 73, 26],
	CMb: [51, 63, 22],
	CAMa: [103, 97, 54],
	CAMb: [118, 108, 68],
	CAa: [105, 98, 58],
	CAap: [58, 68, 25],
	CAb: [102, 100, 55],
	CAbp: [94, 87, 55],
	CFa: [78, 84, 66],
	CFb: [93, 88, 54],
	CG: [98, 91, 59],
	CI: [240, 240, 240],
	HTf: [55, 74, 20],
	HTfp: [59, 80, 24],
	HTs: [75, 85, 33],
	HTsp: [89, 102, 47],
	HDa: [60, 78, 23],
	HDap: [36, 54, 15],
	HDb: [55, 75, 21],
	HDbp: [38, 62, 11],
	HDc: [62, 71, 24],
	HDcp: [64, 74, 27],
	HMa: [60, 73, 26],
	HMb: [51, 63, 22],
	HMc: [51, 63, 22],
	HAMa: [103, 97, 54],
	HAMb: [118, 108, 68],
	HAMc: [118, 108, 68],
	HAa: [107, 105, 53],
	HAap: [124, 116, 63],
	HAb: [107, 105, 53],
	HAbp: [124, 116, 63],
	HAc: [107, 105, 53],
	HAcp: [124, 116, 63],
	HFa: [78, 84, 66],
	HFb: [93, 88, 54],
	HFc: [93, 88, 54],
	HG: [98, 91, 59],
	ETf: [59, 78, 23],
	ETfp: [54, 73, 24],
	ETs: [75, 80, 35],
	ETsp: [67, 76, 30],
	EDa: [60, 78, 23],
	EDap: [36, 54, 15],
	EDb: [55, 75, 21],
	EDbp: [38, 62, 11],
	EMa: [60, 73, 26],
	EMb: [51, 63, 22],
	EAMa: [103, 97, 54],
	EAMb: [118, 108, 68],
	EAa: [105, 98, 58],
	EAap: [58, 68, 25],
	EAb: [102, 100, 55],
	EAbp: [94, 87, 55],
	EFa: [78, 84, 66],
	EFb: [93, 88, 54],
	EG: [98, 91, 59],
	Ada: [167, 137, 95],
	Aha: [238, 210, 156],
	Adc: [177, 153, 110],
	Ahc: [208, 181, 141],
	Adh: [167, 137, 95],
	Ahh: [238, 210, 156],
	Ade: [177, 153, 110],
	Ahe: [208, 181, 141],
}

const DEFAULT_PASTA_SATELLITE_OCEAN: [number, number, number] = [
	20 / 255,
	30 / 255,
	66 / 255,
]
