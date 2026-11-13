import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import type { ApparentTemperatureParams } from "@/model/climate/temperature/apparent-temp/types"
import { MATH } from "@/model/shared/math/core"

function apparentTemperatureC({
	tempC,
	rhPercent,
	windSpeedMs,
}: ApparentTemperatureParams): number {
	const t = MATH.clamp({ value: tempC, lo: -50, hi: 50 })
	const v = MATH.clamp({ value: windSpeedMs, lo: 0.5, hi: 17 })
	const rh = MATH.clamp({ value: rhPercent, lo: 0, hi: 100 })
	const p = Math.min(5, (HUMIDITY.saturationVaporPressureKpa(t) * rh) / 100)
	const t2 = t * t
	const t3 = t2 * t
	const t4 = t3 * t
	const t5 = t4 * t
	const t6 = t5 * t
	const v2 = v * v
	const v3 = v2 * v
	const v4 = v3 * v
	const v5 = v4 * v
	const v6 = v5 * v
	const p2 = p * p
	const p3 = p2 * p
	const p4 = p3 * p
	const p5 = p4 * p
	const p6 = p5 * p

	// Bröde et al. (2012), ESM 3, with mean radiant temperature equal to air temperature.
	return (
		t +
		6.07562052e-1 -
		2.27712343e-2 * t +
		8.06470249e-4 * t2 -
		1.54271372e-4 * t3 -
		3.24651735e-6 * t4 +
		7.32602852e-8 * t5 +
		1.35959073e-9 * t6 -
		2.2583652 * v +
		8.80326035e-2 * t * v +
		2.16844454e-3 * t2 * v -
		1.53347087e-5 * t3 * v -
		5.72983704e-7 * t4 * v -
		2.55090145e-9 * t5 * v -
		7.51269505e-1 * v2 -
		4.08350271e-3 * t * v2 -
		5.21670675e-5 * t2 * v2 +
		1.94544667e-6 * t3 * v2 +
		1.14099531e-8 * t4 * v2 +
		1.58137256e-1 * v3 -
		6.57263143e-5 * t * v3 +
		2.22697524e-7 * t2 * v3 -
		4.16117031e-8 * t3 * v3 -
		1.27762753e-2 * v4 +
		9.66891875e-6 * t * v4 +
		2.52785852e-9 * t2 * v4 +
		4.56306672e-4 * v5 -
		1.74202546e-7 * t * v5 -
		5.91491269e-6 * v6 +
		5.12733497 * p -
		3.12788561e-1 * t * p -
		1.96701861e-2 * t2 * p +
		9.9969087e-4 * t3 * p +
		9.51738512e-6 * t4 * p -
		4.66426341e-7 * t5 * p +
		5.48050612e-1 * v * p -
		3.30552823e-3 * t * v * p -
		1.6411944e-3 * t2 * v * p -
		5.16670694e-6 * t3 * v * p +
		9.52692432e-7 * t4 * v * p -
		4.29223622e-2 * v2 * p +
		5.00845667e-3 * t * v2 * p +
		1.00601257e-6 * t2 * v2 * p -
		1.81748644e-6 * t3 * v2 * p -
		1.25813502e-3 * v3 * p -
		1.79330391e-4 * t * v3 * p +
		2.34994441e-6 * t2 * v3 * p +
		1.29735808e-4 * v4 * p +
		1.2906487e-6 * t * v4 * p -
		2.28558686e-6 * v5 * p -
		2.80626406 * p2 +
		5.48712484e-1 * t * p2 -
		3.9942841e-3 * t2 * p2 -
		9.54009191e-4 * t3 * p2 +
		1.93090978e-5 * t4 * p2 -
		3.08806365e-1 * v * p2 +
		1.16952364e-2 * t * v * p2 +
		4.95271903e-4 * t2 * v * p2 -
		1.90710882e-5 * t3 * v * p2 +
		2.10787756e-3 * v2 * p2 -
		6.98445738e-4 * t * v2 * p2 +
		2.30109073e-5 * t2 * v2 * p2 +
		4.1785659e-4 * v3 * p2 -
		1.27043871e-5 * t * v3 * p2 -
		3.04620472e-6 * v4 * p2 -
		3.53874123e-2 * p3 -
		2.2120119e-1 * t * p3 +
		1.55126038e-2 * t2 * p3 -
		2.63917279e-4 * t3 * p3 +
		4.53433455e-2 * v * p3 -
		4.32943862e-3 * t * v * p3 +
		1.45389826e-4 * t2 * v * p3 +
		2.1750861e-4 * v2 * p3 -
		6.66724702e-5 * t * v2 * p3 +
		3.3321714e-5 * v3 * p3 +
		6.14155345e-1 * p4 -
		6.16755931e-2 * t * p4 +
		1.33374846e-3 * t2 * p4 +
		3.55375387e-3 * v * p4 -
		5.13027851e-4 * t * v * p4 +
		1.02449757e-4 * v2 * p4 +
		8.82773108e-2 * p5 -
		3.01859306e-3 * t * p5 +
		1.04452989e-3 * v * p5 +
		1.48348065e-3 * p6
	)
}

export const APPARENT_TEMP = { apparentTemperatureC }
