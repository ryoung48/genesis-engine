import type { OwnerParams } from "@/model/history/distribution/status/types"

const UNINHABITED = -1
const STATELESS = -2

function isOwned({ owner }: OwnerParams): boolean {
	return owner >= 0
}
function isStateless({ owner }: OwnerParams): boolean {
	return owner === STATELESS
}
function isUninhabited({ owner }: OwnerParams): boolean {
	return owner === UNINHABITED
}

export const DISTRIBUTION_STATUS = {
	uninhabited: UNINHABITED,
	stateless: STATELESS,
	isOwned,
	isStateless,
	isUninhabited,
}
