import { useMemo, useState } from "react"
import { SCRIPT } from "@/model/society/script"
import { Button } from "@/ui/components/primitives/Button"
import { uiTokens } from "@/ui/components/tokens"
import { ScriptGlyphGrid } from "@/ui/genesis/controls/ScriptGlyphGrid"
import { ScriptOverrideControls } from "@/ui/genesis/controls/ScriptOverrideControls"
import { readScriptOverrides } from "@/ui/genesis/controls/script-overrides"
import { renderScriptTexture } from "@/ui/genesis/renderer/script-texture"

const MAX_LANGUAGE_SEED = 0x7fffffff

export function ScriptExperiment() {
	const [languageSeedInput, setLanguageSeedInput] = useState("1")
	const [name, setName] = useState(
		"The quick brown fox jumps over the lazy dog",
	)
	const [overrides, setOverrides] = useState<Record<string, string>>({})
	const languageSeed = Number(languageSeedInput)
	const validLanguageSeed =
		Number.isInteger(languageSeed) &&
		languageSeed >= 1 &&
		languageSeed <= MAX_LANGUAGE_SEED
	const settings = useMemo(() => readScriptOverrides(overrides), [overrides])
	const script = useMemo(() => {
		if (!validLanguageSeed) return null
		const generated = SCRIPT.spawn({
			languageSeed,
			generatorOptions: settings.generatorOptions,
		})
		return {
			...generated,
			compressionRatio: settings.compressionRatio ?? generated.compressionRatio,
			render: { ...generated.render, ...settings.renderOptions },
		}
	}, [validLanguageSeed, languageSeed, settings])
	const labelText = script ? SCRIPT.compressLabel({ name, script }) : ""
	const labelImage = useMemo(
		() =>
			script && labelText
				? renderScriptTexture(script, labelText, {
						scale: settings.scale,
					})?.canvas.toDataURL()
				: null,
		[script, labelText, settings.scale],
	)

	const randomizeSeed = () => {
		const [random] = crypto.getRandomValues(new Uint32Array(1))
		setLanguageSeedInput(String((random % MAX_LANGUAGE_SEED) + 1))
	}

	return (
		<main className={uiTokens.generator.page}>
			<div className="mx-auto flex max-w-6xl flex-col gap-5">
				<h1 className="text-2xl font-semibold">Heritage scripts</h1>
				<div
					className={`space-y-5 border p-5 ${uiTokens.radius.lg} ${uiTokens.border.default} ${uiTokens.surface.panel}`}
				>
					<div className={uiTokens.generator.toolbar}>
						<label className={uiTokens.generator.field}>
							Seed
							<input
								className={uiTokens.generator.input}
								type="number"
								min={1}
								max={MAX_LANGUAGE_SEED}
								value={languageSeedInput}
								onChange={(event) => setLanguageSeedInput(event.target.value)}
							/>
						</label>
						<Button size="md" selected onClick={randomizeSeed}>
							Randomize
						</Button>
					</div>
					<ScriptOverrideControls values={overrides} onChange={setOverrides} />
					{script && <ScriptGlyphGrid script={script} expanded />}
					<label className={uiTokens.generator.field}>
						Map label
						<input
							className={uiTokens.generator.input}
							value={name}
							maxLength={400}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
					{labelImage ? (
						<figure
							className={`space-y-2 overflow-x-auto border p-2 ${uiTokens.radius.md} ${uiTokens.border.default} ${uiTokens.surface.panelMuted}`}
						>
							<img
								className="max-w-none"
								src={labelImage}
								alt="Map script preview"
							/>
							<figcaption className={`font-mono ${uiTokens.text.muted}`}>
								{labelText}
							</figcaption>
						</figure>
					) : (
						<p className={uiTokens.text.muted}>
							{!validLanguageSeed
								? "Enter a seed from 1 to 2147483647."
								: "Enter a map label to preview."}
						</p>
					)}
				</div>
			</div>
		</main>
	)
}
