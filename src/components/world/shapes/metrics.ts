import * as d3 from "d3"
import { WEATHER } from "@/model/cells/weather"
import { MATH } from "@/model/utilities/math"

const elevation = [
	0, 300, 600, 1200, 2000, 3000, 4000, 6000, 9000, 12000, 16000, 20000, 26000,
].map(MATH.conversion.distance.feet.km)

const elevationScale = d3.scaleLinear(elevation, [
	"#A6BF97",
	"#8AAB78",
	"#B0B784",
	"#D6D2AD",
	"#D1C99B",
	"#C0AA79",
	"#937B57",
	"#736248",
	"#867764",
	"#B3AA99",
	"#CCC4B7",
	"#ECE9E2",
	"#F4F3EF",
])

const terrainScales: Record<string, d3.ScaleLinear<string, string>> = {
	flat: d3
		.scaleLinear<string>()
		.domain([0, 0.1, 0.2])
		.range(["#A6BF97", "#8AAB78", "#B0B784"])
		.clamp(true),
	hills: d3
		.scaleLinear<string>()
		.domain([0.15, 0.35, 0.6])
		.range(["#B0B784", "#D6D2AD", "#D1C99B"])
		.clamp(true),
	plateau: d3
		.scaleLinear<string>()
		.domain([0.5, 1.5, 3.5])
		.range(["#B8976A", "#C0AA79", "#CBAB72"])
		.clamp(true),
	mountains: d3
		.scaleLinear<string>()
		.domain([0.6, 2, 4, 5.5])
		.range(["#BDA882", "#736248", "#B3AA99", "#F4F3EF"])
		.clamp(true),
}

const metric = true

export const MAP_METRICS = {
	metric,
	development: {
		scale: d3.scaleLinear([0, 5], [0, 1]),
		color: (k: number) => d3.interpolateBrBG(k),
	},
	climate: {
		chaotic: "#c293ff",
		colors: {
			arctic: "#d3efff",
			subarctic: "#7fd0ff",
			boreal: "#91ffdc",
			temperate: "#e6f598",
			subtropical: "#ffa75b",
			tropical: "#ff7785",
			infernal: "#7e4349",
			chaotic: "#c293ff",
		} as Record<string, string>,
		tempColor: d3
			.scaleLinear<string>()
			.domain([-10, -5, 4, 10, 20, 30, 40])
			.range([
				"#d3efff",
				"#7fd0ff",
				"#91ffdc",
				"#e6f598",
				"#ffa75b",
				"#ff7785",
				"#7e4349ff",
			])
			.clamp(true),
	},
	terrain: {
		categorical: {
			coastal: "hsla(157, 21%, 57%, 1)", // Sandy/light coastal tan
			marsh: "#7abdb4ff", // Muted swampy green
			flat: "#a8bc81", // Soft meadow green
			hills: "#7d8c5c", // Deeper upland green
			plateau: "#c2b091", // Arid highland tan
			mountains: "#707372", // Granite mountain gray
		},
		color: (km: number, topography?: string) => {
			const scale = topography && terrainScales[topography]
			return (scale ? scale(km) : elevationScale(km)) as unknown as string
		},
		format: (km: number, p = 2) =>
			metric
				? `${km.toFixed(p)} km`
				: `${MATH.conversion.distance.km.miles(km).toFixed(p)} mi`,
	},
	rain: {
		scale: d3.scaleLinear(
			Object.values(WEATHER.rain.scale.monthly).reverse(),
			MATH.scaleDiscrete(Object.keys(WEATHER.rain.scale.monthly).length),
		),
		color: (r: number) => d3.interpolateViridis(MAP_METRICS.rain.scale(r)),

		value: (mm: number) => (metric ? mm : MATH.conversion.height.mm.in(mm)),
		format: (mm: number) =>
			`${MAP_METRICS.rain.value(mm).toFixed(0)} ${MAP_METRICS.rain.units()}`,
		units: () => (metric ? "mm" : "in"),
	},
	temperature: {
		color: d3
			.scaleLinear<string>()
			.domain([
				-73, -51.11, -40, -28.89, -17.78, 0, 4.44, 10, 15.56, 21.11, 23.89,
				26.67, 29.44, 32.22, 35, 37.78, 40.56, 43.33, 46.11, 48.89, 80,
			])
			.range([
				"#f8fbff",
				"#dceefa",
				"#a3c2e6",
				"#8cb6d8",
				"#6495cd",
				"#2e5984",
				"#3b9ebf",
				"#6acdd8",
				"#9bd59f",
				"#d2e67f",
				"#f1e47e",
				"#f0c66f",
				"#f2a15e",
				"#f49b42",
				"#ef7d3b",
				"#e15c4f",
				"#d64964",
				"#ba2f6d",
				"#a31563",
				"#7d004f",
				"#5a002f",
			])
			.clamp(true),
		value: (celsius: number) =>
			metric
				? celsius
				: MATH.conversion.temperature.celsius.fahrenheit(celsius),
		format: (celsius: number) =>
			`${MAP_METRICS.temperature.value(celsius).toFixed(0)}° ${MAP_METRICS.temperature
				.units()
				.replace("°", "")}`,
		units: () => (metric ? "°C" : "°F"),
	},
	vegetation: {
		color: {
			desert: "#e8cca7", // Dusty desert sand
			sparse: "#b9bc91", // Muted scrubland
			grasslands: "#9db47b", // Soft meadow green
			woods: "#7d8c5c", // Balanced forest green
			forest: "#4d613c", // Deep temperate wood
			jungle: "#2d4d29", // Dark tropical canopy
		},
	},
	wind: {
		scale: d3
			.scaleLinear([0, 0.5, 1, 2, 4], [0, 0.25, 0.5, 0.75, 1])
			.clamp(true),
		color: (speed: number) =>
			d3.interpolateYlOrRd(MAP_METRICS.wind.scale(speed)),
	},
	pressure: {
		scale: d3.scaleLinear([940, 1013.25, 1040], [-1, 0, 1]).clamp(true),
		color: (p: number) => d3.interpolateRdBu(1 - MAP_METRICS.pressure.scale(p)),
		format: (p: number) => `${p.toFixed(1)} hPa`,
	},
	humidity: {
		scale: d3.scaleLinear([0, 5, 15, 30], [0, 0.33, 0.66, 1]).clamp(true),
		color: (h: number) => d3.interpolateYlGnBu(MAP_METRICS.humidity.scale(h)),
	},
}
