import { register } from "node:module"
import { parentPort } from "node:worker_threads"

register("./alias-hooks.mjs", import.meta.url)

const { KERNELS } = await import("@/model/shared/parallel/kernels")

parentPort.on("message", ({ task, payload, start, end, control }) => {
	try {
		KERNELS[task]({ ...payload, start, end })
	} catch (error) {
		console.error(`Parallel task "${task}" failed:`, error)
		Atomics.add(control, 1, 1)
	}
	Atomics.add(control, 0, 1)
	Atomics.notify(control, 0)
})
