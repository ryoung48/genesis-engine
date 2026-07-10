#!/usr/bin/env node
/**
 * Converts a Natural Earth "rivers_lake_centerlines" GeoJSON into a compact
 * static asset of river polylines (lon/lat + a width proxy from
 * `strokeweig`) for the Earth-import pipeline to snap onto mesh regions and
 * for direct rendering, replacing procedural river generation.
 *
 * Usage:
 *   node scripts/convert-rivers-to-lines.mjs <input.geojson> <output.json>
 */

import { readFileSync, writeFileSync } from "node:fs"

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
	console.error("Usage: node convert-rivers-to-lines.mjs <input.geojson> <output.json>")
	process.exit(1)
}

const geojson = JSON.parse(readFileSync(inPath, "utf8"))

function round(n) {
	return Math.round(n * 10000) / 10000
}

const lines = []
for (const feature of geojson.features) {
	const g = feature.geometry
	const paths = g.type === "LineString" ? [g.coordinates] : g.coordinates
	const strokeweig =
		typeof feature.properties?.strokeweig === "number"
			? feature.properties.strokeweig
			: 0.5
	for (const path of paths) {
		if (path.length < 2) continue
		const flat = []
		for (const [lon, lat] of path) flat.push(round(lon), round(lat))
		lines.push({ points: flat, strokeweig })
	}
}

writeFileSync(outPath, JSON.stringify({ lines }))
console.log(`Wrote ${outPath}: ${lines.length} river polylines`)
