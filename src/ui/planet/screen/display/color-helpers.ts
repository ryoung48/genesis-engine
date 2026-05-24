function shadeColorAtElevation(
	color: [number, number, number],
	heightKm: number,
	maxDarken: number,
	darkenRate: number,
	postShade = 1,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const shade = (1 - Math.min(maxDarken, h * darkenRate)) * postShade
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

export function darkenVegetationAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const satBoost = 1.5 - h * 0.2
	const clampedSat = Math.max(0.3, Math.min(1.6, satBoost))
	const lightFactor = 0.75 + h * 0.08
	const clampedLight = Math.max(0.6, Math.min(1.2, lightFactor))
	const luma = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
	return [
		Math.max(
			0,
			Math.min(1, (luma + (color[0] - luma) * clampedSat) * clampedLight),
		),
		Math.max(
			0,
			Math.min(1, (luma + (color[1] - luma) * clampedSat) * clampedLight),
		),
		Math.max(
			0,
			Math.min(1, (luma + (color[2] - luma) * clampedSat) * clampedLight),
		),
	]
}

export function darkenClimateAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	return shadeColorAtElevation(color, heightKm, 0.45, 0.06)
}

export function darkenPoliticalAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const saturationBoost = 1 + Math.min(1.2, h * 0.3)
	const shade = 1 - Math.min(0.55, h * 0.12)
	const luma = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114
	return [
		Math.max(
			0,
			Math.min(1, (luma + (color[0] - luma) * saturationBoost) * shade),
		),
		Math.max(
			0,
			Math.min(1, (luma + (color[1] - luma) * saturationBoost) * shade),
		),
		Math.max(
			0,
			Math.min(1, (luma + (color[2] - luma) * saturationBoost) * shade),
		),
	]
}
