const daysPerYear = 365
const daysPerMonth = 30
const daysPerWeek = 7
const hoursPerDay = 24
const minutesPerHour = 60
const secondMS = 1000
const minuteMS = secondMS * 60
const hourMS = minuteMS * 60
const dayMS = hourMS * hoursPerDay
const weekMS = dayMS * daysPerWeek
const monthMS = dayMS * daysPerMonth
const yearMS = dayMS * daysPerYear
const monthsPerYear = Math.round(daysPerYear / daysPerMonth)

const createEpoch = (): Date => {
	const epoch = new Date(0)
	epoch.setFullYear(0, 0, 1)
	epoch.setHours(0, 0, 0, 0)
	return epoch
}

const EPOCH = createEpoch()
const EPOCH_YEAR = EPOCH.getFullYear()

function integerRange(start: number, end: number): number[] {
	const length = Math.max(0, end - start)
	return Array.from({ length }, (_, index) => start + index)
}

export const TIME = {
	constants: {
		daysPerMonth,
		daysPerWeek,
		daysPerYear,
		hoursPerDay,
		minutesPerHour,
		secondMS,
		minuteMS,
		hourMS,
		dayMS,
		weekMS,
		monthMS,
		yearMS,
		monthsPerYear,
	},
	delta: {
		year: (years: number): number => years * yearMS,
		month: (months: number): number => months * monthMS,
	},
	date: {
		fromYear: (year: number): number => {
			const date = new Date(EPOCH)
			date.setFullYear(EPOCH_YEAR + year)
			return date.getTime()
		},
		toYear: (date: number): number => new Date(date).getFullYear() - EPOCH_YEAR,
		format: (date: number): string => {
			const months = [
				"Jan",
				"Feb",
				"Mar",
				"Apr",
				"May",
				"Jun",
				"Jul",
				"Aug",
				"Sep",
				"Oct",
				"Nov",
				"Dec",
			]
			const value = new Date(date)
			return `${months[value.getMonth()]} ${value.getDate()}, Year ${TIME.date.toYear(date)}`
		},
		diffYears: (a: number, b: number): number =>
			(a - b) / TIME.constants.yearMS,
	},
	hours: {
		deconstruct: (rawHours: number) => {
			const hours = rawHours % TIME.constants.hoursPerDay
			const rawMinutes = (hours % 1) * TIME.constants.minutesPerHour
			return {
				seconds: Math.floor((rawMinutes % 1) * TIME.constants.minutesPerHour),
				minutes: Math.floor(rawMinutes),
				hours: Math.floor(hours),
				days: Math.floor(rawHours / TIME.constants.hoursPerDay),
			}
		},
	},
	delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
	month: {
		names: [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		],
		days: (month: number) => {
			const startDay = Math.floor((month * TIME.constants.daysPerYear) / 12)
			const endDay = Math.floor(((month + 1) * TIME.constants.daysPerYear) / 12)
			return integerRange(startDay, endDay)
		},
	},
	season: (month: number) => {
		const winter = [10, 11, 0]
		const spring = [1, 2, 3]
		const summer = [4, 5, 6]
		const fall = [7, 8, 9]
		if (winter.includes(month)) return "winter"
		if (summer.includes(month)) return "summer"
		if (spring.includes(month)) return "spring"
		if (fall.includes(month)) return "autumn"
	},
}
