import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { SystemBody } from "@/model/celestial/system/types"
import {
	EditableStatValue,
	type StatEntry,
} from "@/ui/components/composites/EditableStatValue"
import { AxisRotateClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateClockwiseIcon"
import { AxisRotateCounterClockwiseIcon } from "@/ui/components/primitives/icons/AxisRotateCounterClockwiseIcon"
import { Slider } from "@/ui/components/primitives/Slider"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import { uiTokens } from "@/ui/components/tokens"
import { getMoonSeedBaseName } from "@/ui/wiki/stats/orbit/body-titles"
import {
	formatHours,
	formatLocalCalendarValue,
} from "@/ui/wiki/stats/orbit/formatters"

export function buildDayLengthStats(params: {
	siderealDayHours: number
	orbitalPeriodDays: number
	retrograde?: boolean
	siderealEditor?: StatEntry["editor"]
	tideLockStat?: StatEntry
	/** A locked sidereal day is derived from the lock target's orbital
	 * period (see resolveBodyTideLockSiderealDayHours), not hand-set --
	 * disable its editor rather than let an edit silently desync it. */
	tideLocked?: boolean
	substellarLonStat?: StatEntry
	/** See formatLocalCalendarValue's doc -- only ever set for a moon's own
	 * card. */
	moonOrbitalPeriodDays?: number
}): StatEntry[] {
	const solarDayHours = ORBIT_BODY.computeSolarDayHours({
		siderealDayHours: params.siderealDayHours,
		orbitalPeriodDays: params.orbitalPeriodDays,
		retrograde: params.retrograde,
	})
	return [
		{
			label: "Local Calendar",
			value: formatLocalCalendarValue(
				params.orbitalPeriodDays,
				solarDayHours,
				params.moonOrbitalPeriodDays,
			),
		},
		{
			label: "Rotation",
			valuePrefix: formatHours(params.siderealDayHours, {
				dayPrecision: 2,
				hourPrecision: 2,
			}),
			value: params.tideLockStat ? " · " : "",
			valueAction: params.tideLockStat ? (
				<EditableStatValue stat={params.tideLockStat} />
			) : undefined,
			editor: params.tideLocked ? undefined : params.siderealEditor,
		},
		...(params.substellarLonStat ? [params.substellarLonStat] : []),
	]
}

function buildTideLockOptionButton(params: {
	key: string
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			key={params.key}
			type="button"
			onClick={params.onClick}
			className={`rounded border px-2 py-1 text-left text-[9px] font-semibold transition-colors ${
				params.active
					? "border-slate-900 bg-slate-900 text-white"
					: "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
			}`}
		>
			{params.label}
		</button>
	)
}

function buildTideLockEditorContent(params: {
	tideLock: TideLock | null | undefined
	onSetLock: (lock: TideLock | null) => void
	starTitle: string
	starTarget: number
	/** Present for a moon's card: the parent planet it can lock to. */
	parent?: { title: string; target: number }
	/** Present for a planet's card: its own moons it can lock to. */
	moons?: { label: string; target: number }[]
}) {
	const { tideLock, onSetLock } = params
	return (
		<div className="flex w-40 flex-col gap-1 px-1 pt-0.5 pb-2">
			<span className={`mb-1 ${uiTokens.type.labelSm} text-slate-500`}>
				Tide Lock
			</span>
			{buildTideLockOptionButton({
				key: "none",
				label: "None",
				active: !tideLock,
				onClick: () => onSetLock(null),
			})}
			{params.parent
				? buildTideLockOptionButton({
						key: "parent",
						label: params.parent.title,
						active:
							tideLock?.type === "planet" &&
							tideLock.target === params.parent.target,
						onClick: () =>
							onSetLock({ type: "planet", target: params.parent!.target }),
					})
				: buildTideLockOptionButton({
						key: "star",
						label: params.starTitle,
						active: tideLock?.type === "solar",
						onClick: () =>
							onSetLock({ type: "solar", target: params.starTarget }),
					})}
			{params.moons?.map((moon) =>
				buildTideLockOptionButton({
					key: `moon-${moon.target}`,
					label: moon.label,
					active: tideLock?.type === "lunar" && tideLock.target === moon.target,
					onClick: () => onSetLock({ type: "lunar", target: moon.target }),
				}),
			)}
		</div>
	)
}

export function buildTideLockStat(params: {
	tideLock: TideLock | null | undefined
	/** See OrbitBody.tideLockStatus's doc -- "1:1" whenever tideLock is set,
	 * "3:2" for a spin-orbit resonance (tideLock stays null for that case),
	 * undefined otherwise. Drives this stat's displayed descriptor: "1:1
	 * Tidal Lock" / "3:2 Tidal Lock" / a plain prograde-retrograde read off
	 * axialTiltDeg (see the `retrograde` param) when neither applies. */
	tideLockStatus?: "1:1" | "3:2"
	/** Only consulted when tideLockStatus is unset, to label the value
	 * "Prograde" or "Retrograde" instead. */
	retrograde: boolean
	starTitle: string
	onSelectStar: () => void
	parentTitle?: string
	onSelectParent?: () => void
	siblingMoons?: MoonBody[]
	onSelectSiblingMoon?: (moonIndex: number) => void
	resolveSiblingMoonLabel?: (moon: MoonBody, moonIndex: number) => string
	/** When set, the stat becomes editable: clicking the value opens a
	 * dropdown of valid lock targets for this body (star + own moons for a
	 * planet, or just its parent for a moon). */
	onSetLock?: (lock: TideLock | null) => void
	/** Present only on a moon's card -- the parent planet's SystemBody idx. */
	parentTarget?: number
}): StatEntry {
	const { tideLock } = params
	const unlockedDescriptor =
		params.tideLockStatus === "3:2"
			? "3:2 Tidal Lock"
			: params.retrograde
				? "Retrograde"
				: "Prograde"

	const editorContent = params.onSetLock
		? buildTideLockEditorContent({
				tideLock,
				onSetLock: params.onSetLock,
				starTitle: params.starTitle,
				starTarget: 0,
				parent:
					params.parentTitle && params.parentTarget !== undefined
						? { title: params.parentTitle, target: params.parentTarget }
						: undefined,
				moons: params.parentTitle
					? undefined
					: params.siblingMoons?.map((moon, moonIndex) => ({
							label:
								params.resolveSiblingMoonLabel?.(moon, moonIndex) ??
								getMoonSeedBaseName({
									moon,
									moonIndex,
									showRealSolNames: true,
								}),
							target: moon.idx,
						})),
			})
		: undefined
	const editor: StatEntry["editor"] | undefined = editorContent
		? {
				label: "Tide Lock",
				value: 0,
				min: 0,
				max: 1,
				step: 1,
				display: "",
				set: () => void 0,
				content: editorContent,
			}
		: undefined

	if (!tideLock) {
		return {
			label: "Tide Lock",
			value: unlockedDescriptor,
			valueHelp: unlockedDescriptor,
			editor,
		}
	}

	return {
		label: "Tide Lock",
		value: "1:1 Tidal Lock",
		valueHelp: "1:1 Tidal Lock",
		editor,
	}
}

// Locking a body to a target means it always shows the same face toward
// that target, i.e. its sidereal day becomes equal to its orbital period
// around whatever it's now locked to. Returns undefined (leave the current
// sidereal day alone) for "None" or a target this stat card can't resolve.
export function resolveBodyTideLockSiderealDayHours(
	lock: TideLock | null,
	body: SystemBody,
): number | undefined {
	if (!lock) return undefined
	if (lock.type === "solar") return body.orbitalPeriodDays * 24
	if (lock.type === "lunar") {
		const moon = body.moons.find((m) => m.idx === lock.target)
		return moon ? moon.orbitalPeriodDays * 24 : undefined
	}
	return undefined
}

export function resolveMoonTideLockSiderealDayHours(
	lock: TideLock | null,
	moon: MoonBody,
): number | undefined {
	if (!lock) return undefined
	if (lock.type === "planet") return moon.orbitalPeriodDays * 24
	return undefined
}

export function buildSubstellarLonStat(params: {
	tideLock: TideLock | null | undefined
	substellarLon: number | undefined
	onSet?: (value: number) => void
}): StatEntry | null {
	if (params.tideLock?.type !== "solar") return null
	const value = params.substellarLon ?? 0
	return {
		label: "Substellar Lon",
		value: `${value.toFixed(0)}°`,
		editor: params.onSet
			? {
					label: "Substellar Lon",
					value,
					min: 0,
					max: 360,
					step: 1,
					display: `${value.toFixed(0)}°`,
					set: params.onSet,
				}
			: undefined,
	}
}

export function buildDirectionalAngleEditorConfig(params: {
	label: string
	value: number
	onSet: (value: number) => void
	onToggleDirection: () => void
}): Pick<NonNullable<StatEntry["editor"]>, "min" | "max" | "content"> {
	const isRetrograde = params.value > 90
	const min = isRetrograde ? 90.5 : 0
	const max = isRetrograde ? 180 : 90

	return {
		min,
		max,
		content: (
			<div className="flex w-44 flex-col px-1 pt-0.5 pb-2">
				<Slider
					label={
						<span className="flex min-w-0 items-center gap-2">
							<UITooltip
								content={
									isRetrograde ? "switch to prograde" : "switch to retrograde"
								}
								position="top"
								align="center"
							>
								<button
									type="button"
									onClick={params.onToggleDirection}
									className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
								>
									{isRetrograde ? (
										<AxisRotateCounterClockwiseIcon className="h-3 w-3" />
									) : (
										<AxisRotateClockwiseIcon className="h-3 w-3" />
									)}
								</button>
							</UITooltip>
							<span className={`${uiTokens.type.labelSm} text-slate-500`}>
								{params.label}
							</span>
						</span>
					}
					value={`${params.value.toFixed(1)}°`}
					min={min}
					max={max}
					step={0.5}
					inputValue={params.value}
					onChange={params.onSet}
				/>
			</div>
		),
	}
}
