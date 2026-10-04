import type { HashParams } from "@/model/shared/random/hash/types"

function unit({ seed, channel, salt }: HashParams): number {
	let value =
		seed ^ Math.imul(channel, 0x9e3779b9) ^ Math.imul(salt, 0x85ebca77)
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
	return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}
export const HASH = { unit }
