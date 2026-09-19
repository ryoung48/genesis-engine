import { useMemo } from "react"
import type { RawOrganizationReference } from "@/model/history/earth/data-source/types"
import { DATE } from "@/model/history/earth/date"
import { NAMES } from "@/model/society/language/names"
import type { HistoryTimelineInput } from "@/ui/genesis/generation/types"
import { useEarthHistoryTimeline } from "@/ui/genesis/generation/useEarthHistoryTimeline"
import { useProceduralHistoryTimeline } from "@/ui/genesis/generation/useProceduralHistoryTimeline"

export function useHistoryTimeline(input: HistoryTimelineInput) {
	const earth = useEarthHistoryTimeline({
		provinces: input.world?.provinces,
		isEarthImport: !!input.world?.isEarthImport,
	})
	const procedural = useProceduralHistoryTimeline(input)
	const proceduralOrganizations = useMemo(() => {
		if (!input.world?.nations?.organizations) return null
		const names = NAMES.createWorldNames(input.world)
		return new Map<string, RawOrganizationReference>(
			input.world.nations.organizations.map((organization) => {
				const color = organization.color.map((value) =>
					Math.round(value * 255),
				) as [number, number, number]
				return [
					organization.id,
					{
						id: organization.id,
						name: names.organization(organization.id),
						color,
						borderLightColor: color,
						borderDarkColor: color,
					},
				]
			}),
		)
	}, [input.world])
	if (input.world?.isEarthImport) return earth
	return {
		...procedural,
		loading: false,
		provinceMeta: procedural.state?.provinceMeta ?? null,
		organizationReference: proceduralOrganizations,
		formatLabel: DATE.formatHistoryTimeMs,
	}
}
