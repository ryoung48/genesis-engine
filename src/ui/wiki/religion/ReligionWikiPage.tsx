import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import type { ReligionWikiPageProps } from "@/ui/wiki/religion/types"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"

export function ReligionWikiPage({ religion }: ReligionWikiPageProps) {
	return (
		<div className="space-y-2 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={religion.name}
					meta={
						<>
							<Swatch color={religion.color} />
							<span>{religion.typeName}</span>
							<span>·</span>
							<InlineTextButton
								onClick={religion.onBack}
								className="text-slate-500"
							>
								{religion.planetTitle}
							</InlineTextButton>
						</>
					}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{renderStatGrid(religion.stats)}
				</div>
			</Surface>
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<ChipGroup label={religion.familyName} count={religion.siblings.length}>
					{religion.siblings.length ? (
						religion.siblings.map(({ key, ...chip }) => (
							<EntityChip key={key} {...chip} />
						))
					) : (
						<EmptyState message="No sibling religions" centered={false} />
					)}
				</ChipGroup>
			</Surface>
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				{[
					{ label: "Virtues", traits: religion.virtues },
					{ label: "Sins", traits: religion.sins },
				].map((group) => (
					<ChipGroup
						key={group.label}
						label={group.label}
						count={group.traits.length}
					>
						{group.traits.map((trait) => (
							<EntityChip key={trait} name={trait} color={religion.color} />
						))}
					</ChipGroup>
				))}
			</Surface>
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<ChipGroup
					label="Nations holding this religion"
					count={religion.nations.length}
				>
					{religion.nations.length ? (
						religion.nations.map(({ key, ...chip }) => (
							<EntityChip key={key} {...chip} />
						))
					) : (
						<EmptyState
							message="No nations hold this religion at the viewed date"
							centered={false}
						/>
					)}
				</ChipGroup>
			</Surface>
		</div>
	)
}
