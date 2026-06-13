export function parseStoredCodeList(stored: string | null): string[] {
	if (!stored) return []

	try {
		const parsed = JSON.parse(stored)
		if (!Array.isArray(parsed)) return []
		const seen = new Set<string>()
		const codes: string[] = []
		for (const value of parsed) {
			if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
				continue
			}
			seen.add(value)
			codes.push(value)
		}
		return codes
	} catch {
		return []
	}
}

export function getOrderedRecentCodes(
	recentCodes: readonly string[],
	starredRecentCodes: readonly string[],
): string[] {
	const starred = new Set(starredRecentCodes)
	return [
		...recentCodes.filter((code) => !starred.has(code)),
		...starredRecentCodes,
	]
}

export function toggleStarredRecentCode(
	recentCodes: readonly string[],
	starredRecentCodes: readonly string[],
	code: string,
	maxRecentCodes: number,
): {
	recentCodes: string[]
	starredRecentCodes: string[]
} {
	if (starredRecentCodes.includes(code)) {
		return {
			recentCodes: [
				code,
				...recentCodes.filter((entry) => entry !== code),
			].slice(0, maxRecentCodes),
			starredRecentCodes: starredRecentCodes.filter((entry) => entry !== code),
		}
	}

	return {
		recentCodes: recentCodes.filter((entry) => entry !== code),
		starredRecentCodes: [...starredRecentCodes, code],
	}
}

export function pushRecentCode(
	recentCodes: readonly string[],
	starredRecentCodes: readonly string[],
	code: string,
	maxRecentCodes: number,
): string[] {
	if (starredRecentCodes.includes(code)) {
		return recentCodes.filter((entry) => entry !== code)
	}

	return [code, ...recentCodes.filter((entry) => entry !== code)].slice(
		0,
		maxRecentCodes,
	)
}
