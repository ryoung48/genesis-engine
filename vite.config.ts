/// <reference types="vitest/config" />

import { availableParallelism } from "node:os"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { type Connect, defineConfig, type Plugin } from "vite"
import { BENCH_DIGEST } from "./src/bench/digest/index.ts"

const BENCH_API_PREFIX = "/api/bench/runs"

function benchApi(): Plugin {
	const handle: Connect.NextHandleFunction = (req, res, next) => {
		const url = new URL(req.url ?? "", "http://localhost")
		if (!url.pathname.startsWith(BENCH_API_PREFIX)) return next()
		const id = decodeURIComponent(
			url.pathname.slice(BENCH_API_PREFIX.length).replace(/^\//, ""),
		)
		try {
			const body = id
				? BENCH_DIGEST.detail({ root: process.cwd(), id })
				: BENCH_DIGEST.list(process.cwd())
			res.setHeader("Content-Type", "application/json")
			res.end(JSON.stringify(body))
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
