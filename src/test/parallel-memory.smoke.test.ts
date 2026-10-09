import { expect, it, vi } from "vitest"
import { PARALLEL } from "@/model/shared/parallel"

it("keeps ordinary arrays when SharedArrayBuffer is unavailable", () => {
	const source = new Float32Array([1, 2, 3])
	vi.stubGlobal("SharedArrayBuffer", undefined)
	try {
		expect(PARALLEL.local(source)).toBe(source)
	} finally {
		vi.unstubAllGlobals()
	}
})

it("copies shared results into transferable ordinary memory", () => {
	const source = new Float32Array(new SharedArrayBuffer(12))
	source.set([1, 2, 3])
	const result = PARALLEL.local(source)
	expect(result).toEqual(source)
	expect(result.buffer).toBeInstanceOf(ArrayBuffer)
	expect(result.buffer).not.toBe(source.buffer)
	expect(PARALLEL.local(result)).toBe(result)
})
