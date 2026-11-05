import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { expect, it } from "vitest"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisParams } from "@/model/pipelines/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

it("records regenerated eclipse isolation fingerprints", () => {
	const params: GenesisParams = {
		...DEFAULT_WORLD_PARAMS,
		seed: 14963991,
		numPoints: 8000,
		tideLock: null,
	}
	const start = performance.now()
	const world = GENERATE_WORLD.generateGenesisWorld({ params })
	const arrays = Object.fromEntries(
		Object.entries(world).flatMap(([key, value]) =>
			ArrayBuffer.isView(value)
				? [
						[
							key,
							createHash("sha256")
								.update(
									new Uint8Array(
										value.buffer,
										value.byteOffset,
										value.byteLength,
									),
								)
								.digest("hex"),
						],
					]
				: [],
		),
	)
	const schedule = TIDAL_SCHEDULE.computeTidalSchedule({
		params,
		moons: params.moons,
	})
	const forces = schedule.events.map((event) => [
		event.tidalForce,
		event.starForce,
		...event.moonForces,
		...event.moonMoonForces,
	])
	const instant = WEATHER_FIXTURE.instant()
	const weather = LOCAL_WEATHER.sampleProvince({
		context: WEATHER_FIXTURE.context(),
		province: 0,
		instant,
	}).values
	const nonzero = TIDAL_SCHEDULE.computeTidalSchedule({
		params,
		moons: params.moons.map((moon) => ({
			...moon,
			longitudeOfAscendingNodeDeg: 90,
		})),
	})
	const timingStart = performance.now()
	const sky = WEATHER_SKY.moons({
		instant,
		latitudeDeg: 0,
		moons: params.moons,
		params,
	})
	const coldSkyMs = performance.now() - timingStart
	const fingerprint = {
		arrays,
		forces,
		maxForce: schedule.maxForce,
		minForce: schedule.minForce,
		weather,
	}
	const directory = "stats/eclipses"
	mkdirSync(directory, { recursive: true })
	const baseline = `${directory}/isolation-before.json`
	if (existsSync(baseline)) {
		expect(fingerprint).toEqual(
			JSON.parse(readFileSync(baseline, "utf8")).fingerprint,
		)
	} else {
		writeFileSync(
			baseline,
			JSON.stringify(
				{
					fingerprint,
					sky,
					coldSkyMs,
					oldEvents: schedule.events,
					nonzero: nonzero.events,
				},
				null,
				2,
			),
		)
	}
	writeFileSync(
		`${directory}/isolation-current.json`,
		JSON.stringify(
			{
				fingerprint,
				sky,
				coldSkyMs,
				nonzero: nonzero.events,
				elapsedMs: performance.now() - start,
			},
			null,
			2,
		),
	)
}, 120000)
