import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type { RawOrganizationReference } from "@/model/history/earth/data-source/types"

let indexPromise: Promise<Map<string, RawOrganizationReference>> | null = null

function getOrganizationReferenceIndex(): Promise<
	Map<string, RawOrganizationReference>
> {
	if (!indexPromise) {
		indexPromise = DATA_SOURCE.loadOrganizationReference().then(
			(organizations) => {
				const map = new Map<string, RawOrganizationReference>()
				for (const organization of organizations)
					map.set(organization.id, organization)
				return map
			},
		)
	}
	return indexPromise
}

export const ORGANIZATIONS = {
	getOrganizationReferenceIndex,
}
