/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"
import { configDefaults } from "vitest/config"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const isTest = mode === "test" || process.env.VITEST === "true"
	const base = process.env.VITE_BASE_PATH ?? "/"

	return {
		base,
		server: {
			watch: {
				ignored: ["**/*.{test,spec}.{ts,tsx}", "**/*.smoke.test.ts"],
			},
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
			// coverage: {
			// 	provider: "v8",
			// 	reporter: ["text-summary", "json-summary"],
			// 	thresholds: {
			// 		statements: 97.06,
			// 		branches: 92.51,
			// 		functions: 96.8,
			// 		lines: 97.86,
			// 	},
			// },
			projects: [
				{
					extends: true,
					test: {
						name: "unit",
						include: ["src/**/*.{test,spec}.{ts,tsx}"],
						exclude: [...configDefaults.exclude, "src/**/*.smoke.test.ts"],
						sequence: {
							groupOrder: 0,
						},
					},
				},
				{
					extends: true,
					test: {
						name: "smoke",
						include: ["src/**/*.smoke.test.ts"],
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
