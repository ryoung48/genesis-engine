import { useCallback, useState } from "react"
import { WEBGCM_EXPORT } from "@/model/climate/export/webgcm"
import { WEBGCM_NATIVE } from "@/model/climate/export/webgcm/native"
import type { ExportWidthPreset } from "@/ui/genesis/controls/OverlayControls/types"
import {
	buildMapExportFilename,
	sanitizeExportIdentity,
} from "@/ui/genesis/shared/export/map-export-naming"
import type { MapExportInput } from "@/ui/genesis/view/types"

export function useMapExport(input: MapExportInput) {
	const { sceneRef, worldForDisplay, seed, exportCenterLongitude } = input

	const [exportWidthPreset, setExportWidthPreset] =
		useState<ExportWidthPreset>("8192")
	const [exportProgress, setExportProgress] = useState<{
		percent: number
		label: string
	} | null>(null)
	const [exportError, setExportError] = useState<string | null>(null)

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleExportMap = useCallback(async () => {
		const native = exportWidthPreset === "webgcm-native"
		const terrain = exportWidthPreset === "webgcm" || native
		if (!worldForDisplay || exportProgress || (!terrain && !sceneRef.current))
			return
		const width = Number(exportWidthPreset)
		setExportError(null)
		setExportProgress({ percent: 0, label: "Preparing export" })
		try {
			const blob = terrain
				? new Blob(
						[
							native
								? await WEBGCM_NATIVE.createFile({
										world: worldForDisplay,
										onProgress: setExportProgress,
									})
								: await WEBGCM_EXPORT.createRaster({
										mesh: worldForDisplay.mesh,
										elevationKm: worldForDisplay.elevation_km,
										onProgress: setExportProgress,
									}),
						],
						{ type: "application/octet-stream" },
					)
				: await sceneRef.current.exportMapPng({
						width,
						centerLongitudeDeg: exportCenterLongitude,
						onProgress: (percent, label) => {
							setExportProgress({ percent, label })
						},
					})
			const objectUrl = window.URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = objectUrl
			link.download = terrain
				? `chaos-world-${sanitizeExportIdentity(seed?.toString()) ?? "terrain"}.${native ? "gcmworld" : "bin"}`
				: buildMapExportFilename(seed, width)
			document.body.appendChild(link)
			link.click()
			link.remove()
			window.URL.revokeObjectURL(objectUrl)
			setExportProgress(null)
		} catch (error) {
			console.error("Failed to export world:", error)
			setExportError(error instanceof Error ? error.message : "Export failed")
			setExportProgress(null)
		}
	}, [
		exportCenterLongitude,
		exportProgress,
		exportWidthPreset,
		seed,
		worldForDisplay,
	])

	const exportBusy = exportProgress !== null
	const exportDisabled = !worldForDisplay || exportBusy

	return {
		exportWidthPreset,
		setExportWidthPreset,
		exportProgress,
		exportError,
		handleExportMap,
		exportBusy,
		exportDisabled,
	}
}
