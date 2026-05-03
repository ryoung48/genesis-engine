export function capitalize(value: string): string {
	if (value.length === 0) return value
	return value[0].toUpperCase() + value.slice(1)
}

export function titleCase(value: string): string {
	return value
		.split(" ")
		.map((part) => capitalize(part))
		.join(" ")
}
