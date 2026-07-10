#!/usr/bin/env node
/**
 * Converts a Natural Earth "land" GeoJSON into a compact static asset of
 * lon/lat ring coordinates for rendering an exact vector coastline overlay
 * on the globe (independent of mesh resolution).
 *
 * Usage:
 *   node scripts/convert-coastline-to-lines.mjs <input.geojson> <output.json>
 */

import { readFileSync, writeFileSync } from "node:fs"

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
	console.error(
		"Usage: node convert-coastline-to-lines.mjs <input.geojson> <output.json>",
	)
	process.exit(1)
}

const geojson = JSON.parse(readFileSync(inPath, "utf8"))

// 4 decimal places ≈ 11m precision at the equator — far finer than needed
// for a rendered line, keeps the asset compact.
function round(n) {
	return Math.round(n * 10000) / 10000
}

const rings = []
for (const feature of geojson.features) {
	const g = feature.geometry
	const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
	for (const poly of polys) {
		for (const ring of poly) {
			const flat = []
			for (const [lon, lat] of ring) {
				flat.push(round(lon), round(lat))
			}
			rings.push(flat)
		}
	}
}

writeFileSync(outPath, JSON.stringify({ rings }))
console.log(`Wrote ${outPath}: ${rings.length} rings`)
