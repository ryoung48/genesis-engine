import type { HeritageScript } from "@/model/society/script"
import { SCRIPT } from "@/model/society/script"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { LabelMode } from "@/ui/genesis/controls/OverlayControls"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { EARTH_HISTORY_LABEL_SCALE_CURVE } from "@/ui/genesis/renderer/nation-label-overlay/constants"
import {
	buildGlobeNationLabels,
	buildMapNationLabels,
} from "@/ui/genesis/renderer/nation-label-overlay/nation-labels"
import {
	buildGlobeHeritageLabels,
	buildGlobePartitionLabels,
	buildMapHeritageLabels,
	buildMapPartitionLabels,
} from "@/ui/genesis/renderer/nation-label-overlay/partition-labels"
import {
	createNationLabelPools,
	disposePool,
} from "@/ui/genesis/renderer/nation-label-overlay/pool"
import {
	buildGlobeSettlementLabels,
	buildMapSettlementLabels,
	createSettlementLabelPools,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-labels"
import {
	buildGlobeNationScripts,
	buildMapNationScripts,
	createNationScriptPools,
	createPendingNationScriptTextureQueue,
	disposeNationScriptPools,
} from "@/ui/genesis/renderer/nation-script-overlay"

export function stringArraysEqual(
	a: readonly string[] | null,
	b: readonly string[] | null,
): boolean {
	if (a === b) return true
	if (!a || !b || a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

function int32ArraysEqual(a: Int32Array | null, b: Int32Array | null): boolean {
	if (a === b) return true
	if (!a || !b || a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

/** Exported for setEarthHistoryNationOverride, which stays in
 * create-genesis-scene.ts since it also calls the not-yet-extracted
 * rebuildNationBorders. */
export function earthHistoryNationOverridesEqual(
	a: {
		assignment: Int32Array
		seeds: Int32Array
		names: string[]
	} | null,
	b: {
		assignment: Int32Array
		seeds: Int32Array
		names: string[]
	} | null,
): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return (
		int32ArraysEqual(a.assignment, b.assignment) &&
		int32ArraysEqual(a.seeds, b.seeds) &&
		stringArraysEqual(a.names, b.names)
	)
}

function earthHistoryLabelPartitionsEqual(
	a: {
		culture: { assignment: Int32Array; count: number; names: string[] }
		religion: { assignment: Int32Array; count: number; names: string[] }
	} | null,
	b: {
		culture: { assignment: Int32Array; count: number; names: string[] }
		religion: { assignment: Int32Array; count: number; names: string[] }
	} | null,
): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return (
		a.culture.count === b.culture.count &&
		a.religion.count === b.religion.count &&
		int32ArraysEqual(a.culture.assignment, b.culture.assignment) &&
		int32ArraysEqual(a.religion.assignment, b.religion.assignment) &&
		stringArraysEqual(a.culture.names, b.culture.names) &&
		stringArraysEqual(a.religion.names, b.religion.names)
	)
}

export interface LabelsControllerDeps {
	updateOverlayVisibility: () => void
}

/** Owns nation/settlement/culture/religion/heritage labels and the nation
 * heritage-script overlay -- the five `rebuildXLabels` functions and their
 * name/mode setters. Reads (but doesn't own) `earthHistoryNationOverride`
 * and `currentOrgHighlight`, which are set by setEarthHistoryNationOverride/
 * setOrganizationHighlight -- those stay in create-genesis-scene.ts since
 * they also call the not-yet-extracted rebuildNationBorders. See
 * plans/genesis-scene-controller-split.md. */
export function createLabelsController(
	ctx: GenesisContext,
	deps: LabelsControllerDeps,
) {
	// create-genesis-scene.ts also owns a permanently-null-const org-name
	// label overlay (globeOrgLabel/mapOrgLabel, orgLabelPools) that
	// rebuildNationLabels used to `.clear()` here -- always a no-op since
	// that const is never reassigned anywhere in the file (pre-existing,
	// out of scope for this split). Dropped from the relocated function
	// rather than duplicating dead state into this controller too;
	// create-genesis-scene.ts's updateOverlayVisibility/dispose still read
	// their own copy, unaffected.
	const nationLabelPools = createNationLabelPools()
	const nationScriptPools = createNationScriptPools()
	const settlementLabelPools = createSettlementLabelPools()
	const cultureLabelPools = createNationLabelPools()
	const heritageLabelPools = createNationLabelPools()
	const religionLabelPools = createNationLabelPools()
	const labelCullingEnabled = true

	function getHeritageScripts(
		world: SerializedGenesisWorld,
	): Map<number, HeritageScript> {
		if (ctx.heritageScripts) return ctx.heritageScripts
		const scripts = new Map<number, HeritageScript>()
		if (world.heritages?.languageSeeds) {
			for (
				let heritageIdx = 0;
				heritageIdx < world.heritages.count;
				heritageIdx++
			) {
				scripts.set(
					heritageIdx,
					SCRIPT.spawn(`script:${world.heritages.languageSeeds[heritageIdx]}`),
				)
			}
		}
		ctx.heritageScripts = scripts
		return scripts
	}

	function rebuildNationLabels() {
		if (ctx.currentOrgHighlight) {
			// Org map mode shows no labels at all -- neither the underlying
			// nation names/scripts nor the org's own name label -- keeping the
			// recolored territory clean.
			if (ctx.globeNationScripts) ctx.globeGroup.remove(ctx.globeNationScripts)
			if (ctx.mapNationScripts) ctx.scene.remove(ctx.mapNationScripts)
			ctx.pendingNationScriptTextureQueue = null
			ctx.globeNationScripts = null
			ctx.mapNationScripts = null
			ctx.globeNationLabels?.clear()
			ctx.mapNationLabels?.clear()
			return
		}
		if (ctx.globeNationScripts) ctx.globeGroup.remove(ctx.globeNationScripts)
		if (ctx.mapNationScripts) ctx.scene.remove(ctx.mapNationScripts)
		ctx.pendingNationScriptTextureQueue = null
		ctx.globeNationScripts = null
		ctx.mapNationScripts = null
		// Earth-imported worlds skip procedural nation/government generation
		// entirely (see derive-province-society.ts), so ctx.currentWorld.nations
		// is genuinely undefined there -- only bail when there's neither a
		// real procedural nations object NOR an earth-history override to
		// build a shadow one from.
		if (
			!ctx.currentWorld ||
			(!ctx.currentWorld.nations && !ctx.earthHistoryNationOverride)
		) {
			ctx.globeNationLabels?.clear()
			ctx.mapNationLabels?.clear()
			return
		}
		const showNationLabels = ctx.labelMode.nations || ctx.labelMode.dynasty
		if (!showNationLabels) {
			ctx.globeNationLabels?.clear()
			ctx.mapNationLabels?.clear()
			return
		}
		// Earth-imported worlds always show real nation names when scrubbing
		// earth-history, regardless of the dynasty label toggle -- dynasty
		// data isn't part of this engine's scope (see foldedStateToNationInfo,
		// which does track rulers, just not dynastic succession trees).
		const worldForLabels = ctx.earthHistoryNationOverride
			? {
					...ctx.currentWorld,
					nations: {
						...ctx.currentWorld?.nations,
						assignment: ctx.earthHistoryNationOverride.assignment,
						seeds: ctx.earthHistoryNationOverride.seeds,
						// nationProvinceCount (nation-label-overlay.ts) uses
						// nations.size[id] directly -- without a positive-length
						// check -- as label font-scale input, only falling back to
						// scanning `assignment` when size[id] isn't a positive
						// number. Leaving the stale procedural size array in place
						// (like sovereign for borders, see rebuildNationBorders)
						// would size labels by the wrong nation's province count.
						// An empty array makes size[id] undefined for every id,
						// forcing the correct assignment-scan fallback.
						size: new Int32Array(0),
					},
				}
			: ctx.currentWorld
		const labelNames = ctx.earthHistoryNationOverride
			? ctx.earthHistoryNationOverride.names
			: ctx.labelMode.dynasty
				? ctx.dynastyNames
				: ctx.nationNames
		if (!labelNames) {
			ctx.globeNationLabels?.clear()
			ctx.mapNationLabels?.clear()
			return
		}
		// Real historical province-count distributions are far more skewed
		// than the procedural generator's (e.g. Ming's 113 provinces vs. a
		// 1-province German principality, same era) -- the default label
		// scale curve compressed large real empires together almost
		// indistinguishably, so Earth-imported worlds use a wider curve. See
		// EARTH_HISTORY_LABEL_SCALE_CURVE's doc comment.
		const labelScaleCurve = ctx.earthHistoryNationOverride
			? EARTH_HISTORY_LABEL_SCALE_CURVE
			: undefined
		ctx.globeNationLabels = buildGlobeNationLabels(
			worldForLabels,
			labelNames,
			ctx.camera,
			nationLabelPools.globe,
			labelCullingEnabled,
			ctx.elevationVisible,
			labelScaleCurve,
			ctx.globeNationLabels ?? undefined,
		)
		ctx.mapNationLabels = buildMapNationLabels(
			worldForLabels,
			labelNames,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			nationLabelPools.map,
			labelCullingEnabled,
			labelScaleCurve,
			ctx.mapNationLabels ?? undefined,
		)
		if (ctx.globeNationLabels.parent !== ctx.globeGroup)
			ctx.globeGroup.add(ctx.globeNationLabels)
		if (ctx.mapNationLabels) {
			if (!labelCullingEnabled) addMapSlideClones(ctx.mapNationLabels)
			if (ctx.mapMesh) ctx.mapNationLabels.position.copy(ctx.mapMesh.position)
			if (ctx.mapNationLabels.parent !== ctx.scene)
				ctx.scene.add(ctx.mapNationLabels)
		}
		if (
			!ctx.earthHistoryNationOverride &&
			ctx.labelMode.script &&
			ctx.currentWorld.heritages &&
			ctx.currentWorld.cultures &&
			labelNames
		) {
			ctx.pendingNationScriptTextureQueue =
				createPendingNationScriptTextureQueue()
			const scripts = getHeritageScripts(ctx.currentWorld)
			ctx.globeNationScripts = buildGlobeNationScripts(
				ctx.currentWorld,
				labelNames,
				scripts,
				ctx.nationScriptTextureCache,
				ctx.pendingNationScriptTextureQueue,
				ctx.camera,
				nationScriptPools.globe,
				labelCullingEnabled,
				ctx.elevationVisible,
			)
			ctx.mapNationScripts = buildMapNationScripts(
				ctx.currentWorld,
				labelNames,
				scripts,
				ctx.nationScriptTextureCache,
				ctx.pendingNationScriptTextureQueue,
				ctx.currentMapCenterLongitudeDeg,
				ctx.currentMapProjectionLatitudeDeg,
				nationScriptPools.map,
				labelCullingEnabled,
			)
			if (ctx.globeNationScripts) ctx.globeGroup.add(ctx.globeNationScripts)
			if (ctx.mapNationScripts) {
				if (ctx.mapMesh)
					ctx.mapNationScripts.position.copy(ctx.mapMesh.position)
				ctx.scene.add(ctx.mapNationScripts)
			}
		}
		deps.updateOverlayVisibility()
	}

	function rebuildSettlementLabels() {
		if (
			!ctx.currentWorld?.settlementRegions ||
			!ctx.labelMode.settlements ||
			!ctx.settlementLabelNames
		) {
			ctx.globeSettlementLabels?.clear()
			ctx.mapSettlementLabels?.clear()
			return
		}
		ctx.globeSettlementLabels = buildGlobeSettlementLabels(
			ctx.currentWorld,
			ctx.settlementLabelNames,
			ctx.camera,
			settlementLabelPools.globe,
			labelCullingEnabled,
			ctx.elevationVisible,
			ctx.globeSettlementLabels ?? undefined,
		)
		ctx.mapSettlementLabels = buildMapSettlementLabels(
			ctx.currentWorld,
			ctx.settlementLabelNames,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			settlementLabelPools.map,
			labelCullingEnabled,
			ctx.mapSettlementLabels ?? undefined,
		)
		if (ctx.globeSettlementLabels.parent !== ctx.globeGroup) {
			ctx.globeGroup.add(ctx.globeSettlementLabels)
		}
		if (ctx.mapSettlementLabels) {
			if (!labelCullingEnabled) addMapSlideClones(ctx.mapSettlementLabels)
			if (ctx.mapMesh)
				ctx.mapSettlementLabels.position.copy(ctx.mapMesh.position)
			if (ctx.mapSettlementLabels.parent !== ctx.scene)
				ctx.scene.add(ctx.mapSettlementLabels)
		}
		deps.updateOverlayVisibility()
	}

	function rebuildCultureLabels() {
		if (!ctx.currentWorld || !ctx.labelMode.culture) {
			ctx.globeCultureLabels?.clear()
			ctx.mapCultureLabels?.clear()
			return
		}

		const earthCulture = ctx.earthHistoryLabelPartitions?.culture
		if (!earthCulture && (!ctx.currentWorld.cultures || !ctx.cultureNames)) {
			ctx.globeCultureLabels?.clear()
			ctx.mapCultureLabels?.clear()
			return
		}

		const names = earthCulture
			? earthCulture.names
			: (ctx.cultureNames as string[])
		const partitionCount = earthCulture
			? earthCulture.count
			: ctx.currentWorld.cultures!.count
		const getPartition = earthCulture
			? (p: number) => earthCulture.assignment[p] ?? -1
			: (p: number) => ctx.currentWorld!.cultures!.assignment[p] ?? -1
		const scaleCurve = earthCulture
			? EARTH_HISTORY_LABEL_SCALE_CURVE
			: undefined

		ctx.globeCultureLabels = buildGlobePartitionLabels(
			ctx.currentWorld,
			names,
			partitionCount,
			getPartition,
			ctx.camera,
			cultureLabelPools.globe,
			labelCullingEnabled,
			ctx.elevationVisible,
			scaleCurve,
			ctx.globeCultureLabels ?? undefined,
		)
		ctx.mapCultureLabels = buildMapPartitionLabels(
			ctx.currentWorld,
			names,
			partitionCount,
			getPartition,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			cultureLabelPools.map,
			labelCullingEnabled,
			scaleCurve,
			ctx.mapCultureLabels ?? undefined,
		)
		if (ctx.globeCultureLabels.parent !== ctx.globeGroup)
			ctx.globeGroup.add(ctx.globeCultureLabels)
		if (ctx.mapCultureLabels) {
			if (ctx.mapMesh) ctx.mapCultureLabels.position.copy(ctx.mapMesh.position)
			if (ctx.mapCultureLabels.parent !== ctx.scene)
				ctx.scene.add(ctx.mapCultureLabels)
		}
		deps.updateOverlayVisibility()
	}

	function rebuildReligionLabels() {
		const earthReligion = ctx.earthHistoryLabelPartitions?.religion
		if (
			!ctx.currentWorld ||
			!ctx.labelMode.religion ||
			(!earthReligion && (!ctx.currentWorld.religions || !ctx.religionNames))
		) {
			ctx.globeReligionLabels?.clear()
			ctx.mapReligionLabels?.clear()
			return
		}
		const names = earthReligion
			? earthReligion.names
			: (ctx.religionNames as string[])
		const partitionCount = earthReligion
			? earthReligion.count
			: ctx.currentWorld.religions!.count
		const getPartition = earthReligion
			? (p: number) => earthReligion.assignment[p] ?? -1
			: (p: number) => {
					const culture = ctx.currentWorld!.cultures?.assignment[p] ?? -1
					return culture >= 0
						? (ctx.currentWorld!.religions!.assignment[culture] ?? -1)
						: -1
				}
		const scaleCurve = earthReligion
			? EARTH_HISTORY_LABEL_SCALE_CURVE
			: undefined

		ctx.globeReligionLabels = buildGlobePartitionLabels(
			ctx.currentWorld,
			names,
			partitionCount,
			getPartition,
			ctx.camera,
			religionLabelPools.globe,
			labelCullingEnabled,
			ctx.elevationVisible,
			scaleCurve,
			ctx.globeReligionLabels ?? undefined,
		)
		ctx.mapReligionLabels = buildMapPartitionLabels(
			ctx.currentWorld,
			names,
			partitionCount,
			getPartition,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			religionLabelPools.map,
			labelCullingEnabled,
			scaleCurve,
			ctx.mapReligionLabels ?? undefined,
		)
		if (ctx.globeReligionLabels.parent !== ctx.globeGroup) {
			ctx.globeGroup.add(ctx.globeReligionLabels)
		}
		if (ctx.mapReligionLabels) {
			if (ctx.mapMesh) ctx.mapReligionLabels.position.copy(ctx.mapMesh.position)
			if (ctx.mapReligionLabels.parent !== ctx.scene)
				ctx.scene.add(ctx.mapReligionLabels)
		}
		deps.updateOverlayVisibility()
	}

	function rebuildHeritageLabels() {
		if (
			!ctx.currentWorld?.heritages ||
			!ctx.labelMode.heritage ||
			!ctx.heritageNames
		) {
			ctx.globeHeritageLabels?.clear()
			ctx.mapHeritageLabels?.clear()
			return
		}
		ctx.globeHeritageLabels = buildGlobeHeritageLabels(
			ctx.currentWorld,
			ctx.heritageNames,
			ctx.camera,
			heritageLabelPools.globe,
			labelCullingEnabled,
			ctx.elevationVisible,
			ctx.globeHeritageLabels ?? undefined,
		)
		ctx.mapHeritageLabels = buildMapHeritageLabels(
			ctx.currentWorld,
			ctx.heritageNames,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			heritageLabelPools.map,
			labelCullingEnabled,
			ctx.mapHeritageLabels ?? undefined,
		)
		if (ctx.globeHeritageLabels.parent !== ctx.globeGroup) {
			ctx.globeGroup.add(ctx.globeHeritageLabels)
		}
		if (ctx.mapHeritageLabels) {
			if (ctx.mapMesh) ctx.mapHeritageLabels.position.copy(ctx.mapMesh.position)
			if (ctx.mapHeritageLabels.parent !== ctx.scene)
				ctx.scene.add(ctx.mapHeritageLabels)
		}
		deps.updateOverlayVisibility()
	}

	function rebuildAll() {
		rebuildNationLabels()
		rebuildSettlementLabels()
		rebuildCultureLabels()
		rebuildHeritageLabels()
		rebuildReligionLabels()
	}

	function setLabelMode(mode: LabelMode) {
		if (ctx.labelMode === mode) return
		ctx.labelMode = mode
		rebuildAll()
	}

	function setNationNames(names: string[] | null) {
		if (stringArraysEqual(ctx.nationNames, names)) return
		ctx.nationNames = names
		rebuildNationLabels()
	}

	function setDynastyNames(names: string[] | null) {
		if (stringArraysEqual(ctx.dynastyNames, names)) return
		ctx.dynastyNames = names
		rebuildNationLabels()
	}

	function setCultureNames(names: string[] | null) {
		if (stringArraysEqual(ctx.cultureNames, names)) return
		ctx.cultureNames = names
		rebuildCultureLabels()
	}

	function setHeritageNames(names: string[] | null) {
		if (stringArraysEqual(ctx.heritageNames, names)) return
		ctx.heritageNames = names
		rebuildHeritageLabels()
	}

	function setReligionNames(names: string[] | null) {
		if (stringArraysEqual(ctx.religionNames, names)) return
		ctx.religionNames = names
		rebuildReligionLabels()
	}

	function setSettlementNames(names: string[] | null) {
		if (stringArraysEqual(ctx.settlementLabelNames, names)) return
		ctx.settlementLabelNames = names
		rebuildSettlementLabels()
	}

	function setEarthHistoryLabelPartitions(
		partitions: {
			culture: { assignment: Int32Array; count: number; names: string[] }
			religion: { assignment: Int32Array; count: number; names: string[] }
		} | null,
	) {
		if (
			earthHistoryLabelPartitionsEqual(
				ctx.earthHistoryLabelPartitions,
				partitions,
			)
		)
			return
		ctx.earthHistoryLabelPartitions = partitions
		rebuildCultureLabels()
		rebuildReligionLabels()
	}

	function disposePools() {
		disposePool(nationLabelPools.globe)
		disposePool(nationLabelPools.map)
		disposeNationScriptPools(nationScriptPools)
		disposePool(settlementLabelPools.globe)
		disposePool(settlementLabelPools.map)
		disposePool(cultureLabelPools.globe)
		disposePool(cultureLabelPools.map)
		disposePool(heritageLabelPools.globe)
		disposePool(heritageLabelPools.map)
		disposePool(religionLabelPools.globe)
		disposePool(religionLabelPools.map)
	}

	return {
		getHeritageScripts,
		rebuildNationLabels,
		rebuildSettlementLabels,
		rebuildCultureLabels,
		rebuildReligionLabels,
		rebuildHeritageLabels,
		rebuildAll,
		setLabelMode,
		setNationNames,
		setDynastyNames,
		setCultureNames,
		setHeritageNames,
		setReligionNames,
		setSettlementNames,
		setEarthHistoryLabelPartitions,
		disposePools,
	}
}
