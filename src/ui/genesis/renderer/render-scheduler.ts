interface RenderSchedulerOptions {
	cancelFrame: (handle: number) => void
	onFrame: (timeMs: number) => boolean
	requestFrame: (callback: FrameRequestCallback) => number
}

interface RenderScheduler {
	dispose: () => void
	requestRender: () => void
	setAnimationActive: (active: boolean) => void
}

export function createRenderScheduler(
	options: RenderSchedulerOptions,
): RenderScheduler {
	let animationActive = false
	let disposed = false
	let frameHandle = 0
	let frameScheduled = false

	const scheduleFrame = () => {
		if (disposed || frameScheduled) return
		frameScheduled = true
		frameHandle = options.requestFrame((timeMs) => {
			frameScheduled = false
			const keepAnimating = options.onFrame(timeMs)
			if (animationActive || keepAnimating) scheduleFrame()
		})
	}

	return {
		requestRender() {
			scheduleFrame()
		},
		setAnimationActive(active) {
			animationActive = active
			if (active) scheduleFrame()
		},
		dispose() {
			if (disposed) return
			disposed = true
			if (frameScheduled) {
				options.cancelFrame(frameHandle)
				frameScheduled = false
			}
		},
	}
}
