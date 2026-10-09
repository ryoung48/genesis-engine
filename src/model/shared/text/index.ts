function capitalize(value: string): string {
	if (value.length === 0) return value
	return value[0].toUpperCase() + value.slice(1)
}

function titleCase(value: string): string {
	return value
		.split(" ")
		.map((part) => capitalize(part))
		.join(" ")
}

const ROMAN_NUMERALS: readonly (readonly [number, string])[] = [
	[10, "X"],
	[9, "IX"],
	[5, "V"],
	[4, "IV"],
	[1, "I"],
]

function roman(value: number): string {
	let rest = value
	let result = ""
	for (const [size, numeral] of ROMAN_NUMERALS)
		while (rest >= size) {
			result += numeral
			rest -= size
		}
	return result
}

export const TEXT = {
	capitalize,
	titleCase,
	roman,
}
