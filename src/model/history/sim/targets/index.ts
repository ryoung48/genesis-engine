import type {
	ContactShareParams,
	InterpolateParams,
	InterpolateRowsParams,
	SizeBucketParams,
	TargetProfile,
	TargetProfileParams,
} from "@/model/history/sim/targets/types"

const BUCKET_UPPER_BOUNDS = [1, 4, 9, 24, 49, 100, Number.POSITIVE_INFINITY]

const STATE_HELD_YEARS = [476, 1066, 1500, 1701, 1914]
const STATE_HELD_PERCENT = [50, 60, 71, 79, 95]

const CONNECTED_HELD_SHARE = 0.947
const ISOLATED_HELD_SHARE = 0.28
const CONTACT_MATURITY_YEARS = 1200

const SIZE_YEARS = [867, 1066, 1701, 1914]
const SIZE_PERCENT = [
	[2.99, 8.45, 12.32, 16.34, 10.96, 18.02, 30.93],
	[3.0, 18.14, 10.84, 12.4, 7.06, 8.97, 39.59],
	[1.34, 3.97, 6.62, 11.6, 7.64, 8.85, 59.98],
	[0.17, 0.72, 0.69, 3.04, 2.34, 5.39, 87.64],
]

const CEILING_YEARS = [1066, 1701]
const CEILING_PROVINCES = [809, 1870, 2014]

// Non-desolate provinces of the 204,000-point verification world (seed 14963991).
const REFERENCE_HABITABLE_PROVINCES = 10974

function interpolate({ years, values, year }: InterpolateParams): number {
	if (year <= years[0]) return values[0]
	const last = years.length - 1
	if (year >= years[last]) return values[last]
	let i = 0
	while (year > years[i + 1]) i++
	const f = (year - years[i]) / (years[i + 1] - years[i])
	return (1 - f) * values[i] + f * values[i + 1]
}

function interpolateRows({
	years,
	rows,
	year,
}: InterpolateRowsParams): number[] {
	return rows[0].map((_, b) =>
		interpolate({ years, values: rows.map((row) => row[b]), year }),
	)
}

function ceilingAt(year: number): number {
	let tier = 0
	while (tier < CEILING_YEARS.length && year >= CEILING_YEARS[tier]) tier++
	return CEILING_PROVINCES[tier]
}

function at({ year, habitableProvinces }: TargetProfileParams): TargetProfile {
	const percent = interpolateRows({
		years: SIZE_YEARS,
		rows: SIZE_PERCENT,
		year,
	})
	const total = percent.reduce((sum, value) => sum + value, 0)
	return {
		stateHeld:
			interpolate({
				years: STATE_HELD_YEARS,
				values: STATE_HELD_PERCENT,
				year,
			}) / 100,
		sizeShares: percent.map((value) => value / total),
		ceiling: Math.max(
			1,
			Math.round(
				(ceilingAt(year) * habitableProvinces) / REFERENCE_HABITABLE_PROVINCES,
			),
		),
	}
}

function contactShare({ years }: ContactShareParams): number {
	return (
		ISOLATED_HELD_SHARE +
		(CONNECTED_HELD_SHARE - ISOLATED_HELD_SHARE) *
			(1 - Math.exp(-Math.max(0, years) / CONTACT_MATURITY_YEARS))
	)
}

function bucketOf({ size }: SizeBucketParams): number {
	let bucket = 0
	while (size > BUCKET_UPPER_BOUNDS[bucket]) bucket++
	return bucket
}

export const TARGET_PROFILE = {
	bucketCount: BUCKET_UPPER_BOUNDS.length,
	at,
	bucketOf,
	contactShare,
}
