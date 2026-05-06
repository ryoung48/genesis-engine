import { describe, expect, it } from "vitest"
import { createHistoryRng, initHistory, simulateUntil, YEAR_MS } from "."
import {
	buildHistoryFrame,
	type HistoryFrameBuildProfile,
	type HistoryTimelineSerializationProfile,
	serializeHistoryTimelines,
} from "./snapshot"
import { getCachedWorld } from "./test-world"

const SNAPSHOT_BENCH_ITERATIONS = 5

function createTimelineProfile(): HistoryTimelineSerializationProfile {
	return {
		intFieldsMs: 0,
		floatFieldsMs: 0,
		relationsMs: 0,
		colorsMs: 0,
		totalMs: 0,
	}
}

function createFrameProfile(): HistoryFrameBuildProfile {
	return {
		hierarchyMs: 0,
		provinceFieldsMs: 0,
		warsMs: 0,
		summaryMs: 0,
		relationsMs: 0,
		totalMs: 0,
	}
}

function averageByKey<T extends object>(rows: T[]): { [K in keyof T]: number } {
	const totals = {} as { [K in keyof T]: number }
	for (const row of rows) {
		for (const key of Object.keys(row) as Array<keyof T>) {
			totals[key] = (totals[key] ?? 0) + Number(row[key])
		}
	}
	for (const key of Object.keys(totals) as Array<keyof T>) {
		totals[key] /= Math.max(rows.length, 1)
	}
	return totals
}

function formatTopStages(
	profile: Record<string, number>,
	totalKey: string,
): string {
	return Object.entries(profile)
		.filter(([key]) => key !== totalKey)
		.sort(([, left], [, right]) => right - left)
		.slice(0, 3)
		.map(([key, value]) => `${key}=${value.toFixed(1)}ms`)
		.join(", ")
}

describe("history simulation snapshot smoke", () => {
	it("creates and benchmarks snapshots from a generated simulation", () => {
		const world = getCachedWorld({ seed: 424242, numPoints: 400 })
		expect(world.nations).toBeDefined()
		expect(world.provinces).toBeDefined()
		expect(world.population).toBeDefined()
		expect(world.cultures).toBeDefined()
		expect(world.rivers?.visible).toBeDefined()
		expect(world.coastal).toBeDefined()

		const rng = createHistoryRng(world.params.seed + 99999)
		const state = initHistory({
			nations: world.nations!,
			provinces: world.provinces!,
			population: world.population!,
			coastal: world.coastal!,
			riverVisible: world.rivers!.visible,
			r_xyz: world.mesh.r_xyz,
			cultures: world.cultures!,
			seed: world.params.seed,
		})

		const startYear = state.time / YEAR_MS
		const targetTime = state.time + 10 * YEAR_MS
		const yearlyMetrics: Array<Record<string, number>> = []

		for (let year = startYear; year <= targetTime / YEAR_MS; year++) {
			simulateUntil(state, year * YEAR_MS, rng)

			const frameProfile = createFrameProfile()
			const frameStartedAt = performance.now()
			const frame = buildHistoryFrame(state, frameProfile)
			const frameMs = performance.now() - frameStartedAt

			const timelineProfile = createTimelineProfile()
			const timelinesStartedAt = performance.now()
			const timelines = serializeHistoryTimelines(
				state,
				state.time,
				timelineProfile,
			)
			const timelineMs = performance.now() - timelinesStartedAt

			expect(frame.timeMs).toBe(state.time)
			expect(timelines.endTimeMs).toBe(state.time)
			expect(Array.from(frame.assignment)).toEqual(
				Array.from(state.assignmentCurrent),
			)
			expect(Array.from(frame.parent)).toEqual(Array.from(state.parentCurrent))
			expect(frame.totalPopulation).toBeGreaterThan(0)

			yearlyMetrics.push({
				year,
				totalPopulation: Math.round(frame.totalPopulation),
				sovereignCount: frame.sovereignCount,
				activeWars: frame.activeWars.length,
				frameMs,
				frameProvinceFieldsMs: frameProfile.provinceFieldsMs,
				frameWarsMs: frameProfile.warsMs,
				frameSummaryMs: frameProfile.summaryMs,
				frameRelationsMs: frameProfile.relationsMs,
				timelineMs,
				timelineIntFieldsMs: timelineProfile.intFieldsMs,
				timelineFloatFieldsMs: timelineProfile.floatFieldsMs,
				timelineRelationsMs: timelineProfile.relationsMs,
				timelineColorsMs: timelineProfile.colorsMs,
			})
		}

		const frameProfiles: HistoryFrameBuildProfile[] = []
		const timelineProfiles: HistoryTimelineSerializationProfile[] = []
		let frameTotal = 0
		let timelineTotal = 0

		for (
			let iteration = 0;
			iteration < SNAPSHOT_BENCH_ITERATIONS;
			iteration++
		) {
			const frameProfile = createFrameProfile()
			const frameStartedAt = performance.now()
			const frame = buildHistoryFrame(state, frameProfile)
			frameTotal += performance.now() - frameStartedAt
			frameProfiles.push(frameProfile)

			const timelineProfile = createTimelineProfile()
			const timelineStartedAt = performance.now()
			const timelines = serializeHistoryTimelines(
				state,
				state.time,
				timelineProfile,
			)
			timelineTotal += performance.now() - timelineStartedAt
			timelineProfiles.push(timelineProfile)

			expect(frame.timeMs).toBe(state.time)
			expect(timelines.endTimeMs).toBe(state.time)
		}

		const averageFrameProfile = averageByKey(frameProfiles)
		const averageTimelineProfile = averageByKey(timelineProfiles)
		const frameAvg = frameTotal / SNAPSHOT_BENCH_ITERATIONS
		const timelineAvg = timelineTotal / SNAPSHOT_BENCH_ITERATIONS

		console.info(
			`[snapshot smoke] provinces=${state.P} years=${yearlyMetrics.length} frame=${frameAvg.toFixed(1)}ms timeline=${timelineAvg.toFixed(1)}ms ratio=${(timelineAvg / Math.max(frameAvg, 0.0001)).toFixed(2)}x`,
		)
		console.info(
			`[snapshot bottlenecks] frame=${formatTopStages(averageFrameProfile, "totalMs")} timeline=${formatTopStages(averageTimelineProfile, "totalMs")}`,
		)
		console.info(`[snapshot yearly] ${JSON.stringify(yearlyMetrics, null, 2)}`)
		console.info(
			`[snapshot profile] ${JSON.stringify(
				{
					frame: averageFrameProfile,
					timeline: averageTimelineProfile,
				},
				null,
				2,
			)}`,
		)

		expect(yearlyMetrics).toHaveLength(11)
		expect(yearlyMetrics[0]?.year).toBe(startYear)
		expect(yearlyMetrics.at(-1)?.year).toBe(targetTime / YEAR_MS)
		expect(yearlyMetrics.every((row) => row.totalPopulation > 0)).toBe(true)
		expect(frameAvg).toBeGreaterThan(0)
		expect(timelineAvg).toBeGreaterThan(0)
	}, 90_000)
})
