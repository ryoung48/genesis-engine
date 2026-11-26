import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createServer } from "vite"

const OUT = "src/model/geography/terrain/deposits/districts/thresholds.ts"

const server = await createServer({
	configFile: false,
	resolve: { alias: { "@": resolve("src") } },
	server: { middlewareMode: true, watch: null },
	appType: "custom",
	optimizeDeps: { noDiscovery: true, include: [] },
	logLevel: "error",
})

try {
	const { DISTRICTS } = await server.ssrLoadModule(
		"/src/model/geography/terrain/deposits/districts/index.ts",
	)
	const systems = DISTRICTS.systems()
	const started = performance.now()
	const radiusKm = DISTRICTS.calibrationRadiusKm
	const thresholds = DISTRICTS.calibrate({ systems, radiusKm })
	const key = DISTRICTS.thresholdKey({ systems, radiusKm })
	const rows = thresholds
		.map((row) => `\t\t[${row.map((v) => v.toPrecision(9)).join(", ")}],`)
		.join("\n")
	writeFileSync(
		OUT,
		`import type { DistrictThresholds } from "@/model/geography/terrain/deposits/districts/types"

export const DISTRICT_THRESHOLDS: DistrictThresholds = {
	key: "${key}",
	thresholds: [
${rows}
	],
}
`,
	)
	console.log(
		`wrote ${OUT}: ${thresholds.length} systems, key ${key}, ${((performance.now() - started) / 1000).toFixed(1)} s`,
	)
} finally {
	await server.close()
}
