import { describe, expect, it, vi } from "vitest"
import { createRenderScheduler } from "./render-scheduler"

describe("render-scheduler", () => {
	it("renders on demand without scheduling duplicate frames", () => {
		let frameCallback: FrameRequestCallback | null = null
		const onFrame = vi.fn(() => false)
		const scheduler = createRenderScheduler({
			requestFrame(callback) {
				frameCallback = callback
				return 1
			},
			cancelFrame() {
				return
			},
			onFrame,
		})

		scheduler.requestRender()
		scheduler.requestRender()

		expect(frameCallback).not.toBeNull()
		expect(onFrame).not.toHaveBeenCalled()

		frameCallback?.(16)

		expect(onFrame).toHaveBeenCalledTimes(1)
		scheduler.dispose()
	})

	it("keeps scheduling frames while animation is active", () => {
		const frameCallbacks: FrameRequestCallback[] = []
		const onFrame = vi.fn(() => false)
		const scheduler = createRenderScheduler({
			requestFrame(callback) {
				frameCallbacks.push(callback)
				return frameCallbacks.length
			},
			cancelFrame() {
				return
			},
			onFrame,
		})

		scheduler.setAnimationActive(true)
		expect(frameCallbacks).toHaveLength(1)

		frameCallbacks.shift()?.(16)
		expect(onFrame).toHaveBeenCalledTimes(1)
		expect(frameCallbacks).toHaveLength(1)

		scheduler.setAnimationActive(false)
		frameCallbacks.shift()?.(32)
		expect(onFrame).toHaveBeenCalledTimes(2)
		expect(frameCallbacks).toHaveLength(0)
		scheduler.dispose()
	})

	it("cancels a queued frame on dispose", () => {
		const cancelFrame = vi.fn()
		const scheduler = createRenderScheduler({
			requestFrame() {
				return 42
			},
			cancelFrame,
			onFrame: () => false,
		})

		scheduler.requestRender()
		scheduler.dispose()

		expect(cancelFrame).toHaveBeenCalledWith(42)
	})
})
