import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { expect, test } from "vitest"
import { POISE } from "@/model/climate/temperature/ebm/poise"
import type { VplanetReference } from "./vplanet/types"

test("POISE reference solver reproduces native VPLanet EarthClimate temperatures", () => {
	const reference: VplanetReference = JSON.parse(
		gunzipSync(
			readFileSync("src/test/earth/fixtures/vplanet-earth-climate.json.gz"),
		).toString(),
	)
	const result = POISE.run({
		config: POISE.earthClimate,
		years: 200,
		dtDays: 365 / POISE.earthClimate.discretization.samplesPerYear,
	})
	let squaredError = 0
	let count = 0
	for (let latitude = 0; latitude < result.temperature.length; latitude++) {
		for (
			let sample = 0;
			sample < result.temperature[latitude].length;
			sample++
		) {
			const difference =
				result.temperature[latitude][sample] -
				reference.temperature[sample][latitude]
			squaredError += difference ** 2
			count++
		}
	}
	const temperatureRmseC = Math.sqrt(squaredError / count)

	expect(result.converged).toBe(true)
	expect(result.latsDeg).toHaveLength(reference.latitudeDegrees.length)
	expect(temperatureRmseC).toBeLessThan(0.05)
})
