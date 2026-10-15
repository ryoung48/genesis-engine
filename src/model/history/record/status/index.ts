import type {
	InitialStatusParams,
	ProvinceStatusName,
	StatusNameParams,
} from "@/model/history/record/status/types"

const code = { uninhabited: 0, stateless: 1, state: 2, desolate: 3 } as const

const names: ProvinceStatusName[] = [
	"uninhabited",
	"stateless",
	"state",
	"desolate",
]

function nameOf({ code: value }: StatusNameParams): ProvinceStatusName {
	return names[value]
}

function initial({
	desolate,
	sovereign,
	migrationWave,
	settlementWave,
}: InitialStatusParams): Uint8Array {
	return Uint8Array.from(desolate, (isDesolate, p) => {
		if (isDesolate) return code.desolate
		if (
			migrationWave &&
			settlementWave !== undefined &&
			(migrationWave[p] < 0 || migrationWave[p] > settlementWave)
		)
			return code.uninhabited
		return sovereign[p] < 0 ? code.stateless : code.state
	})
}

export const PROVINCE_STATUS = { code, nameOf, initial }
