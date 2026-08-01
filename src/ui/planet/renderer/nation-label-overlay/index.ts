export {
	DEFAULT_LABEL_SCALE_CURVE,
	EARTH_HISTORY_LABEL_SCALE_CURVE,
	GLOBE_BASE_POSITION,
	GLOBE_CAMERA_LOCAL_POSITION,
	GLOBE_CAMERA_UP,
	GLOBE_GROUP_WORLD_QUATERNION,
	GLOBE_LOCAL_CAMERA_QUATERNION,
	GLOBE_PROJECTED_UP,
	GLOBE_STUB_TIP,
	GLOBE_TO_CAMERA,
	type GlobeLabelLike,
	LABEL_FONT_SIZE_GLOBE,
	LABEL_FONT_SIZE_MAP,
	LABEL_GLOBE_FONT_GAP_FACTOR,
	LABEL_LEADER_COLOR,
	LABEL_LEADER_HEIGHT_FACTOR,
	LABEL_LEADER_OPACITY,
	LABEL_LEADER_RENDER_ORDER,
	LABEL_LIFT_GLOBE,
	LABEL_LIFT_MAP,
	LABEL_MAP_FONT_GAP_FACTOR,
	LABEL_OFFSET_GLOBE_Y,
	LABEL_OFFSET_MAP_X,
	LABEL_OFFSET_MAP_Y,
	LABEL_OUTLINE_COLOR,
	LABEL_OUTLINE_WIDTH,
	LABEL_RENDER_ORDER,
	LABEL_TEXT_COLOR,
	type LabelPool,
	type LabelScaleCurve,
	MAP_Z_ELEVATION_FACTOR,
	MAX_LABEL_SCALE,
	MIN_LABEL_SCALE,
	type NationLabelPools,
	TERRAIN_ELEVATION_SCALE,
} from "@/ui/planet/renderer/nation-label-overlay/constants"
export {
	buildGlobeNationLabels,
	buildMapNationLabels,
} from "@/ui/planet/renderer/nation-label-overlay/nation-labels"
export {
	nationCapitalProvince,
	nationCapitalRegion,
	nationProvinceCount,
} from "@/ui/planet/renderer/nation-label-overlay/nation-lookup"
export { updateGlobeLabelOrientations } from "@/ui/planet/renderer/nation-label-overlay/orientation"
export {
	buildGlobeHeritageLabels,
	buildGlobePartitionLabels,
	buildMapHeritageLabels,
	buildMapPartitionLabels,
} from "@/ui/planet/renderer/nation-label-overlay/partition-labels"
export {
	createLabelPool,
	createNationLabelPools,
	disposePool,
} from "@/ui/planet/renderer/nation-label-overlay/pool"
export {
	computeLabelScale,
	globeLabelStubLength,
	globeLabelTangentOffset,
	labelPositionGlobe,
	labelPositionMap,
} from "@/ui/planet/renderer/nation-label-overlay/positioning"
export {
	buildGlobeSettlementLabels,
	buildMapSettlementLabels,
	createSettlementLabelPools,
	SETTLEMENT_LABEL_FONT_SIZE_GLOBE,
	SETTLEMENT_LABEL_FONT_SIZE_MAP,
	SETTLEMENT_LABEL_LIFT_GLOBE,
	SETTLEMENT_LABEL_LIFT_GLOBE_ELEVATION,
	SETTLEMENT_LABEL_OFFSET_GLOBE_Y,
	SETTLEMENT_LOG_MAX,
	SETTLEMENT_LOG_MIN,
} from "@/ui/planet/renderer/nation-label-overlay/settlement-labels"
