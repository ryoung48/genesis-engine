const local = "en-US"

export const TEXT = {
	base64: {
		encode: (str: string) => {
			const uint8Array = new TextEncoder().encode(str)
			const chars = String.fromCharCode(...uint8Array)
			return btoa(chars)
		},
		decode: (str: string) => {
			const binary = atob(str)
			const uint8Array = new Uint8Array(
				binary.split("").map((char) => char.charCodeAt(0)),
			)
			return new TextDecoder().decode(uint8Array)
		},
	},
	capitalize: ([firstLetter, ...restOfWord]: string) =>
		firstLetter.toUpperCase() + restOfWord.join(""),
	formatters: {
		percent: (value: number, precision = 0) =>
			new Intl.NumberFormat(local, {
				style: "percent",
				minimumFractionDigits: precision,
			}).format(value),
		compact: (value: number) =>
			new Intl.NumberFormat(local, { notation: "compact" }).format(value),
		long: (value: number, rounding = 1) =>
			new Intl.NumberFormat(local).format(
				Math.round(value / rounding) * rounding,
			),
		list: (list: string[], ending: string) =>
			list
				.join(", ")
				.replace(/, ([^,]*)$/, `${list.length > 2 ? "," : ""} ${ending} $1`),
		sentences: (str: string) => {
			const matches = str.match(/.+?[.!?]( |$)/g)
			return (matches?.map(TEXT.capitalize)?.join("") ?? str).replace(
				/\.+/g,
				".",
			)
		},
	},
	parseOutermostBrackets: (text: string) => {
		const groups: string[] = []
		let depth = 0
		let curr = ""
		for (const c of text) {
			const former = depth
			if (c === "{") depth++
			if (depth > 0) curr += c
			if (c === "}") depth--
			if (former > 0 && depth === 0) {
				groups.push(curr)
				curr = ""
			}
		}
		return groups
	},
	romanize: (num: number) => {
		const lookup: Record<string, number> = {
			M: 1000,
			CM: 900,
			D: 500,
			CD: 400,
			C: 100,
			XC: 90,
			L: 50,
			XL: 40,
			X: 10,
			IX: 9,
			V: 5,
			IV: 4,
			I: 1,
		}
		let roman = ""
		let i
		for (i in lookup) {
			while (num >= lookup[i]) {
				roman += i
				num -= lookup[i]
			}
		}
		return roman
	},
	titleCase: (str: string) => str.replace(/[^\s-()]+/g, TEXT.capitalize),
}
