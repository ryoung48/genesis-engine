import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	TemperatureTraceEntry,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import type { SystemBody } from "@/model/celestial/system/types"
import {
	EditableStatValue,
	type StatEntry,
	TrailingHelpIcon,
} from "@/ui/components/composites/EditableStatValue"
import { TraceTooltipContent } from "@/ui/components/composites/TraceTooltipContent"
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
	/** Mirrors the galaxy wiki's Rotation distribution swatch colors -- see
	 * rotationSwatchColor in galaxy-body-distributions.ts. */
	rotationColor?: string
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
			// Rendered directly (bypassing renderStatGrid's normal valueHelp ->
			// UITooltip wiring in ui-atoms.tsx, which only ever looks at the
			// *outer* "Rotation" stat, never at a nested valueAction) -- wrap it
			// here instead so a locked stat's tooltip still shows on hover. Only
			// for a non-editable stat: an editable one's value is itself the
			// click target for the lock-target dropdown, which already
			// highlights the active target among its buttons. The trailingHelp
			// info icon is rendered OUTSIDE this wrapper (not via
			// EditableStatValue's own built-in rendering) so hovering it doesn't
			// also trigger this "Locked to X" tooltip underneath/behind it.
			valueAction: params.tideLockStat ? (
				<>
					{params.tideLockStat.valueHelp && !params.tideLockStat.editor ? (
						<UITooltip
							content={params.tideLockStat.valueHelp}
							position="bottom"
							align="center"
						>
							<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
								<EditableStatValue
									stat={{ ...params.tideLockStat, trailingHelp: undefined }}
								/>
							</span>
						</UITooltip>
					) : (
						<EditableStatValue
							stat={{ ...params.tideLockStat, trailingHelp: undefined }}
						/>
					)}
					{params.tideLockStat.trailingHelp ? (
						<TrailingHelpIcon content={params.tideLockStat.trailingHelp} />
					) : null}
				</>
			) : undefined,
			editor: params.tideLocked ? undefined : params.siderealEditor,
			swatchColor: params.rotationColor,
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

function resolveLunarLockTargetName(params: {
	target: number
	siblingMoons?: MoonBody[]
	resolveSiblingMoonLabel?: (moon: MoonBody, moonIndex: number) => string
}): string | undefined {
	const moonIndex = params.siblingMoons?.findIndex(
		(moon) => moon.idx === params.target,
	)
	if (moonIndex === undefined || moonIndex === -1) return undefined
	const moon = params.siblingMoons![moonIndex]!
	return (
		params.resolveSiblingMoonLabel?.(moon, moonIndex) ??
		getMoonSeedBaseName({ moon, moonIndex, showRealSolNames: true })
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
	/** Ported from galaxy-gen's OrbitTooltips.tsx RotationTooltip -- the DM
	 * breakdown behind this body's lock roll (see tide-lock/index.ts's
	 * rollPlanetTideLock/rollMoonTideLock). Empty/unset shows no help icon. */
	trace?: TemperatureTraceEntry[]
}): StatEntry {
	const { tideLock, trace = [] } = params
	const unlockedDescriptor =
		params.tideLockStatus === "3:2"
			? "3:2 Tidal Lock"
			: params.retrograde
				? "Retrograde"
				: "Prograde"
	const totalDm = trace.reduce((sum, entry) => sum + entry.value, 0)
	// Always available (independent of editable/locked state) via a dedicated
	// help-circle icon at the far right of the row -- see EditableStatValue's
	// trailingHelp, which renders it without competing with the value's own
	// hover tooltip or click-to-edit target.
	const traceTooltip =
		trace.length > 0 ? (
			<TraceTooltipContent
				title="Tidal Lock Modifiers"
				trace={trace}
				finalLabel="Total Score"
				finalValue={totalDm}
			/>
		) : undefined

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
			trailingHelp: traceTooltip,
			editor,
		}
	}

	// Only shown when the stat isn't editable -- an editable stat's popover
	// already highlights the active lock target among its buttons, so a
	// redundant hover tooltip would just repeat what's already visible there.
	const lockTargetName = editor
		? undefined
		: tideLock.type === "solar"
			? params.starTitle
			: tideLock.type === "planet"
				? params.parentTitle
				: resolveLunarLockTargetName({
						target: tideLock.target,
						siblingMoons: params.siblingMoons,
						resolveSiblingMoonLabel: params.resolveSiblingMoonLabel,
					})

	return {
		label: "Tide Lock",
		value: "1:1 Tidal Lock",
		valueHelp: lockTargetName
			? `Locked to ${lockTargetName}`
			: "1:1 Tidal Lock",
		trailingHelp: traceTooltip,
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
