import { existsSync, statSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const SOURCE_ROOT = new URL("../../../../", import.meta.url)

function sourceFile(url) {
	const path = fileURLToPath(url)
	if (existsSync(path) && statSync(path).isFile()) return url.href
	if (existsSync(`${path}.ts`)) return pathToFileURL(`${path}.ts`).href
	if (existsSync(`${path}/index.ts`))
		return pathToFileURL(`${path}/index.ts`).href
	return null
}

// Plain Node cannot resolve the "@/" alias or extensionless TypeScript paths.
export function resolve(specifier, context, nextResolve) {
	const target = specifier.startsWith("@/")
		? new URL(specifier.slice(2), SOURCE_ROOT)
		: (specifier.startsWith("./") || specifier.startsWith("../")) &&
				context.parentURL
			? new URL(specifier, context.parentURL)
			: null
	const resolved = target ? sourceFile(target) : null
	return resolved
		? { url: resolved, shortCircuit: true }
		: nextResolve(specifier, context)
}
