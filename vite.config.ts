/// <reference types="vitest/config" />

import { availableParallelism } from "node:os"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { type Connect, defineConfig, type Plugin } from "vite"
import { BENCH_API } from "./src/bench/api.ts"
import { BENCH_DIGEST } from "./src/bench/digest/index.ts"
import { WEATHER_BENCH } from "./src/bench/weather/index.ts"

const BENCH_APIS = [
	{ prefix: BENCH_API.history, digest: BENCH_DIGEST },
	{ prefix: BENCH_API.weather, digest: WEATHER_BENCH },
]

function benchApi(): Plugin {
	const handle: Connect.NextHandleFunction = (req, res, next) => {
		const url = new URL(req.url ?? "", "http://localhost")
		const api = BENCH_APIS.find(
			({ prefix }) =>
				url.pathname === prefix || url.pathname.startsWith(prefix + "/"),
		)
		if (!api) return next()
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.statusCode = 405
			res.setHeader("Allow", "GET, HEAD")
			res.end("Read-only bench endpoint")
			return
		}
		try {
			const id = decodeURIComponent(
				url.pathname.slice(api.prefix.length).replace(/^\//, ""),
			)
			const body = id
				? api.digest.detail({ root: process.cwd(), id })
				: api.digest.list(process.cwd())
			res.setHeader("Content-Type", "application/json")
			res.setHeader("Cache-Control", "no-cache")
			res.end(req.method === "HEAD" ? undefined : JSON.stringify(body))
		} catch (error) {
			res.statusCode = 404
			res.end(error instanceof Error ? error.message : "Bench error")
		}
	}
	return {
		name: "bench-api",
		configureServer: (server) => void server.middlewares.use(handle),
		configurePreviewServer: (server) => void server.middlewares.use(handle),
	}
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
	const isTest = mode === "test" || process.env.VITEST === "true"
	const base = process.env.VITE_BASE_PATH ?? "/"
	const isolationHeaders = {
		"Cross-Origin-Opener-Policy": "same-origin",
		"Cross-Origin-Embedder-Policy": "credentialless",
	}
	const historySmokeFiles = [
		"src/ui/genesis/controls/history-scale/history-scale.smoke.test.ts",
		"src/test/history-run/!(history-run|history-report|retained-memory|siege-calibration).smoke.test.ts",
	]

	return {
		base,
		worker: { format: "es" },
		server: {
			headers: isolationHeaders,
			watch: {
				ignored: [
					"**/.claude/**",
					"**/.opencode/**",
					"**/*.md",
					"**/*.smoke.test.ts",
					"**/coverage/**",
					"**/logs/**",
					"**/scripts/**",
					"**/stats/**",
					"**/tsconfig.json",
				],
			},
		},
		preview: { headers: isolationHeaders },
		optimizeDeps: isTest
			? undefined
			: {
					entries: ["index.html"],
					include: [
						"chart.js",
						"delaunator",
						"react-chartjs-2",
						"react-router-dom",
						"three",
					],
				},
		plugins: [
			react(
				command === "build" && !isTest
					? {
							babel: {
								plugins: [["babel-plugin-react-compiler"]],
							},
						}
					: {},
			),
			...(isTest ? [] : [tailwindcss(), benchApi()]),
		],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		test: {
			projects: [
				{
					extends: true,
					test: {
						name: "history-smoke",
						include: historySmokeFiles,
						fileParallelism: true,
						isolate: true,
						maxWorkers: Math.min(8, availableParallelism()),
						sequence: {
							groupOrder: 0,
						},
						testTimeout: 300000,
						hookTimeout: 120000,
					},
				},
				{
					extends: true,
					test: {
						name: "smoke",
						include: ["src/test/**/*.smoke.test.ts"],
						exclude: historySmokeFiles,
						fileParallelism: false,
						sequence: {
							groupOrder: 1,
						},
						testTimeout: 300000,
					},
				},
			],
		},
	}
})
