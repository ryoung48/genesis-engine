import { EntityChip } from "@/ui/components/composites/EntityChip"
import { WeatherSummary } from "@/ui/components/composites/WeatherSummary"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiTokens } from "@/ui/components/tokens"
import type { ProvinceWikiPageProps } from "@/ui/wiki/province/types"
import { GpsFocusButton, renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import { WikiSection } from "@/ui/wiki/shared/WikiTimeline"

export function ProvinceWikiPage({ province, weather }: ProvinceWikiPageProps) {
	const owner = province.owner
	return (
		<div className={uiTokens.wiki.page}>
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<WikiPageHeader
					title={province.title}
					meta={
						<>
							<span>Province {province.sourceId ?? province.province}</span>
							<span>·</span>
							<InlineTextButton
								onClick={province.onBack}
								className={uiTokens.text.muted}
							>
								{province.planetTitle}
							</InlineTextButton>
							<span>·</span>
							{owner ? (
								<EntityChip
									name={owner.name}
									color={owner.color}
									onClick={() => province.onSelectNation(owner.id)}
								/>
							) : (
								<span>Unowned</span>
							)}
						</>
					}
					metaAction={<GpsFocusButton onClick={province.onFocus} />}
				/>
				<div className={uiTokens.wiki.stats}>
					{renderStatGrid(province.stats)}
				</div>
			</Surface>
			<WikiSection title="Society">
				{province.societyAvailable ? (
					<div className={uiTokens.wiki.stats}>
						{renderStatGrid(province.societyStats)}
					</div>
				) : (
					<p className={uiTokens.wiki.note}>
						Historical society data unavailable
					</p>
				)}
			</WikiSection>
			<WikiSection title="Weather" meta={weather.dateLabel}>
				<WeatherSummary {...weather} />
			</WikiSection>
		</div>
	)
}
