/// <reference types="vitest/config" />

import { availableParallelism } from "node:os"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const isTest = mode === "test" || process.env.VITEST === "true"
	const base = process.env.VITE_BASE_PATH ?? "/"
	const historySmokeFiles = [
		"src/test/history-run/!(history-run|history-report|retained-memory|siege-calibration).smoke.test.ts",
	]

	return {
		base,
		server: {
			watch: {
				ignored: [
					"**/*.md",
					"**/*.smoke.test.ts",
					"**/scripts/**",
					"**/tsconfig.json",
				],
			},
		},
		optimizeDeps: isTest
			? undefined
			: {
					include: [
						"@datastructures-js/priority-queue",
						"chart.js",
						"delaunator",
						"react-chartjs-2",
						"react-router-dom",
						"three",
					],
				},
		plugins: [
			react(
				isTest
					? {}
					: {
							babel: {
								plugins: [["babel-plugin-react-compiler"]],
							},
						},
			),
			...(isTest ? [] : [tailwindcss()]),
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
