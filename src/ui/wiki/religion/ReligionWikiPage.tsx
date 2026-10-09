import { ChipGroup } from "@/ui/components/composites/ChipGroup"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiTokens } from "@/ui/components/tokens"
import type { ReligionWikiPageProps } from "@/ui/wiki/religion/types"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import { WikiSection } from "@/ui/wiki/shared/WikiTimeline"
export function ReligionWikiPage({ religion }: ReligionWikiPageProps) {
	return (
		<div className={uiTokens.wiki.page}>
			<Surface tone="panelMuted" radius="xl" padding="md">
				<WikiPageHeader
					title={religion.name}
					meta={
						<>
							<Swatch color={religion.color} />
							<span>{religion.typeName}</span>
						</>
					}
				/>
				<div className={uiTokens.wiki.stats}>
					{renderStatGrid(religion.stats)}
				</div>
			</Surface>
			<Surface tone="panelMuted" radius="xl" padding="md">
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
			<WikiSection title="Doctrines">
				<div className={uiTokens.wiki.rows}>
					{religion.doctrines.map((row) => (
						<div
							key={row.group}
							data-doctrine={row.group}
							className={`${uiTokens.wiki.row} ${uiTokens.type.valueSm} ${uiTokens.text.primary}`}
						>
							<span>{row.group}</span>
							<span>
								{row.option}
								{row.differs && (
									<span title="Differs from the family's doctrine">
										{" "}
										· differs
									</span>
								)}
							</span>
						</div>
					))}
				</div>
			</WikiSection>
			<Surface tone="panelMuted" radius="xl" padding="md">
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
			<Surface tone="panelMuted" radius="xl" padding="md">
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
