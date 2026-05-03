/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"
import { configDefaults } from "vitest/config"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const isTest = mode === "test" || process.env.VITEST === "true"

	return {
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
			coverage: {
				provider: "v8",
				reporter: ["text-summary", "json-summary"],
				thresholds: {
					statements: 98.37,
					branches: 95.02,
					functions: 96.04,
					lines: 99.14,
				},
			},
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
