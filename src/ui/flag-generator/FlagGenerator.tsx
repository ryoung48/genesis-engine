import { Link } from "react-router-dom"
import { APP_PATHS } from "@/app-routes"
import { cx } from "@/ui/components/lib"
import { Button } from "@/ui/components/primitives/Button"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiTokens } from "@/ui/components/tokens"
import { useFlagGenerator } from "@/ui/flag-generator/useFlagGenerator"
import { FLAG_GENERATOR } from "@/ui/heraldry/simple"

export function FlagGenerator() {
	const {
		seed,
		pattern,
		hue,
		previews,
		setSeed,
		resample,
		setPattern,
		setHue,
	} = useFlagGenerator()
	return (
		<main className={cx(uiTokens.generator.page, uiTokens.surface.canvas)}>
			<header className={uiTokens.generator.header}>
				<div>
					<h1 className={uiTokens.type.hero}>Flag generator</h1>
					<p className={cx(uiTokens.type.value, uiTokens.text.muted)}>
						Explore patterns and colors in the map's shield shape.
					</p>
				</div>
				<Link
					to={APP_PATHS.tectonicLab}
					className={cx(uiTokens.type.control, uiTokens.text.muted)}
				>
					Back to map
				</Link>
			</header>
			<Surface
				padding="lg"
				borderTone="default"
				className={uiTokens.generator.toolbar}
			>
				<label className={uiTokens.generator.field}>
					<span className={uiTokens.type.label}>Batch seed</span>
					<input
						aria-label="Batch seed"
						value={seed}
						onChange={(event) => setSeed(event.target.value)}
						className={cx(uiTokens.generator.input, uiTokens.type.value)}
					/>
				</label>
				<label className={uiTokens.generator.field}>
					<span className={uiTokens.type.label}>Pattern</span>
					<select
						aria-label="Pattern"
						value={pattern}
						onChange={(event) => setPattern(event.target.value)}
						className={cx(uiTokens.generator.input, uiTokens.type.value)}
					>
						<option value="all">All patterns</option>
						{FLAG_GENERATOR.patterns.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))}
					</select>
				</label>
				<label className={uiTokens.generator.field}>
					<span className={uiTokens.type.label}>Hue</span>
					<select
						aria-label="Hue"
						value={hue}
						onChange={(event) => setHue(event.target.value)}
						className={cx(uiTokens.generator.input, uiTokens.type.value)}
					>
						{FLAG_GENERATOR.hues.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))}
					</select>
				</label>
				<Button size="md" selected onClick={resample}>
					Resample flags
				</Button>
			</Surface>
			<p
				className={cx(uiTokens.type.valueSm, uiTokens.text.muted)}
				role="status"
			>
				{previews.length} samples · Same seed reproduces the same flags. Save
				the URL to return to this batch.
			</p>
			<section className={uiTokens.generator.grid} aria-label="Generated flags">
				{previews.map((preview, index) => (
					<Surface
						key={preview.seed}
						padding="lg"
						borderTone="default"
						className={uiTokens.generator.card}
					>
						{preview.imageUrl ? (
							<img
								src={preview.imageUrl}
								alt={`${preview.label} shield, sample ${index + 1}`}
								className={uiTokens.generator.preview}
							/>
						) : (
							<p>Canvas preview unavailable</p>
						)}
						<div className={uiTokens.generator.caption}>
							<p className={uiTokens.type.title}>{preview.label}</p>
							<p className={cx(uiTokens.type.valueSm, uiTokens.text.muted)}>
								Sample {index + 1}
							</p>
							{preview.imageUrl && (
								<a
									href={preview.imageUrl}
									download={`flag-${preview.pattern}-${index + 1}.png`}
									className={cx(uiTokens.type.control, uiTokens.text.muted)}
								>
									Download PNG
								</a>
							)}
						</div>
					</Surface>
				))}
			</section>
		</main>
	)
}
