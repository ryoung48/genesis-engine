import { expect, it, vi } from "vitest"
import type {
	LocalWeatherRequest,
	LocalWeatherResponse,
} from "@/model/climate/weather/local/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

it("boots the dedicated protocol, rejects stale revisions, and preserves missing fields", async () => {
	const messages: LocalWeatherResponse[] = []
	const scope = {
		onmessage: null as
			| ((event: MessageEvent<LocalWeatherRequest>) => void)
			| null,
		postMessage: (value: LocalWeatherResponse) => messages.push(value),
	}
	vi.stubGlobal("self", scope)
	try {
		await import("@/model/climate/weather/local/local-weather.worker")
		const context = WEATHER_FIXTURE.context()
		context.provinces[0].baselines[0].cloud = null
		const send = (request: LocalWeatherRequest) =>
			scope.onmessage!({ data: request } as MessageEvent<LocalWeatherRequest>)
		send({
			type: "init",
			revision: 1,
			requestId: 1,
			context: structuredClone(context),
		})
		expect(messages.pop()?.type).toBe("initialized")
		send({
			type: "snapshot",
			revision: 2,
			requestId: 2,
			province: 0,
			instant: WEATHER_FIXTURE.instant(),
		})
		expect(messages).toHaveLength(0)
		send({
			type: "snapshot",
			revision: 1,
			requestId: 3,
			province: 0,
			instant: WEATHER_FIXTURE.instant(),
		})
		const first = messages.pop()
		send({
			type: "snapshot",
			revision: 1,
			requestId: 4,
			province: 0,
			instant: WEATHER_FIXTURE.instant(),
		})
		const second = messages.pop()
		if (first?.type !== "snapshot" || second?.type !== "snapshot")
			throw new Error("Expected snapshot responses")
		expect(first.snapshot).toEqual(second.snapshot)
		expect(first.snapshot.values?.cloudCover).toBeNull()
		expect(first.snapshot.values?.clouds).toBeNull()
		send({ type: "dispose", revision: 1, requestId: 7 })
	} finally {
		vi.unstubAllGlobals()
	}
})
