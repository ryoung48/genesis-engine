import { useCallback, useState } from "react"
import type { PersonKey } from "@/model/people/query/types"
import type { WikiSelection } from "@/ui/genesis/wiki-bridge/selection/types"

export function useWikiSelection() {
	const [selection, setSelection] = useState<WikiSelection>(null)
	const setSelectedWikiNationId = useCallback(
		(id: number | null) =>
			setSelection(id === null ? null : { kind: "nation", id }),
		[],
	)
	const setSelectedWikiOrganizationId = useCallback(
		(id: string | null) =>
			setSelection(id === null ? null : { kind: "organization", id }),
		[],
	)
	const setSelectedWikiWarId = useCallback(
		(id: number | null) =>
			setSelection(id === null ? null : { kind: "war", id }),
		[],
	)
	const setSelectedWikiPerson = useCallback(
		(id: PersonKey | null) =>
			setSelection(id === null ? null : { kind: "person", id }),
		[],
	)
	const setSelectedWikiReligionId = useCallback(
		(id: number | null) =>
			setSelection(id === null ? null : { kind: "religion", id }),
		[],
	)
	const setSelectedWikiProvince = useCallback(
		(id: number | null) =>
			setSelection((current) =>
				id === null
					? null
					: {
							kind: "province",
							id,
							originNation:
								current?.kind === "nation"
									? current.id
									: current?.kind === "province"
										? current.originNation
										: null,
						},
			),
		[],
	)
	const provinceBack = useCallback(
		() =>
			setSelection((current) =>
				current?.kind === "province" && current.originNation !== null
					? { kind: "nation", id: current.originNation }
					: null,
			),
		[],
	)
	const clearWiki = useCallback(() => setSelection(null), [])
	return {
		selectedWikiNationId: selection?.kind === "nation" ? selection.id : null,
		selectedWikiOrganizationId:
			selection?.kind === "organization" ? selection.id : null,
		selectedWikiWarId: selection?.kind === "war" ? selection.id : null,
		selectedWikiPerson: selection?.kind === "person" ? selection.id : null,
		selectedWikiReligionId:
			selection?.kind === "religion" ? selection.id : null,
		selectedWikiProvince: selection?.kind === "province" ? selection.id : null,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		setSelectedWikiPerson,
		setSelectedWikiReligionId,
		setSelectedWikiProvince,
		provinceBack,
		clearWiki,
	}
}
