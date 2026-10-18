import type { HashParams, KeyedParams } from "@/model/shared/random/hash/types"

function unit({ seed, channel, salt }: HashParams): number {
	let value =
		seed ^ Math.imul(channel, 0x9e3779b9) ^ Math.imul(salt, 0x85ebca77)
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b)
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35)
	return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}
function fnv1a(text: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

function keyed({ seed, key }: KeyedParams): number {
	return (Math.imul(seed | 0, 0x9e3779b1) ^ fnv1a(key)) | 0
}

export const HASH = { unit, keyed }
