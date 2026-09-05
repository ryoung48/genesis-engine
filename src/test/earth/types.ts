export type OceanCurrentWindow = {
	lat: number[]
	lon: number[]
}

export type OceanCurrentFit = {
	modeled: number
	observed: number
	count: number
}

export type OceanCurrentReport = {
	label: string
	fit: OceanCurrentFit
}
