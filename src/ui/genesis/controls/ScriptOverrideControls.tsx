import { Button } from "@/ui/components/primitives/Button"
import { uiTokens } from "@/ui/components/tokens"
import {
	GLYPH_OVERRIDE_SELECTS,
	RENDER_OVERRIDE_SELECTS,
	SCRIPT_OVERRIDE_NUMBERS,
} from "@/ui/genesis/controls/script-overrides"

type OverrideGroupProps = {
	title: string
	selects: typeof GLYPH_OVERRIDE_SELECTS
	numbers: readonly (keyof typeof SCRIPT_OVERRIDE_NUMBERS)[]
	values: Record<string, string>
	onChange: (values: Record<string, string>) => void
}

type ScriptOverrideControlsProps = Pick<
	OverrideGroupProps,
	"values" | "onChange"
>

function OverrideGroup({
	title,
	selects,
	numbers,
	values,
	onChange,
}: OverrideGroupProps) {
	return (
		<fieldset className={uiTokens.generator.toolbar}>
			<legend className="font-semibold">{title}</legend>
			{selects.map(({ name, label, choices }) => (
				<label className={uiTokens.generator.field} key={name}>
					{label}
					<select
						className={uiTokens.generator.input}
						value={values[name] ?? ""}
						onChange={(event) =>
							onChange({ ...values, [name]: event.target.value })
						}
					>
						<option value="">Map default</option>
						{choices.map(({ value, label }) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
			))}
			{numbers.map((name) => {
				const { label, ...limits } = SCRIPT_OVERRIDE_NUMBERS[name]
				return (
					<label className={uiTokens.generator.field} key={name}>
						{label}
						<input
							{...limits}
							className={uiTokens.generator.input}
							type="number"
							placeholder="Map default"
							value={values[name] ?? ""}
							onChange={(event) =>
								onChange({ ...values, [name]: event.target.value })
							}
						/>
					</label>
				)
			})}
		</fieldset>
	)
}

export function ScriptOverrideControls({
	values,
	onChange,
}: ScriptOverrideControlsProps) {
	return (
		<details
			className={`border p-3 ${uiTokens.radius.md} ${uiTokens.border.default}`}
		>
			<summary className="cursor-pointer font-semibold">Overrides</summary>
			<div className="space-y-4 pt-3">
				<OverrideGroup
					title="Glyph generation"
					selects={GLYPH_OVERRIDE_SELECTS}
					numbers={["maxDots"]}
					values={values}
					onChange={onChange}
				/>
				<OverrideGroup
					title="Map label rendering"
					selects={RENDER_OVERRIDE_SELECTS}
					numbers={["noise", "oblique", "carvingWear", "compression", "scale"]}
					values={values}
					onChange={onChange}
				/>
				<Button
					disabled={!Object.values(values).some(Boolean)}
					onClick={() => onChange({})}
				>
					Reset overrides
				</Button>
			</div>
		</details>
	)
}
