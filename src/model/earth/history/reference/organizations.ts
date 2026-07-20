import {
	loadOrganizationReference,
	type RawOrganizationReference,
} from "../data-source"

let indexPromise: Promise<Map<string, RawOrganizationReference>> | null = null

/** org id -> static reference (name, swatch color, border stripe colors). */
export function getOrganizationReferenceIndex(): Promise<
	Map<string, RawOrganizationReference>
> {
	if (!indexPromise) {
		indexPromise = loadOrganizationReference().then((organizations) => {
			const map = new Map<string, RawOrganizationReference>()
			for (const organization of organizations)
				map.set(organization.id, organization)
			return map
		})
	}
	return indexPromise
}
