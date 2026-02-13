import { range } from "d3"

const daysPerYear = 365
const daysPerMonth = 30 // on average
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

// Epoch: Year 0 = midnight Jan 1, Year 0
// Note: JavaScript Date(0, ...) gives year 1900, so we use setFullYear
const createEpoch = (): Date => {
	const epoch = new Date(0)
	epoch.setFullYear(0, 0, 1)
	epoch.setHours(0, 0, 0, 0)
	return epoch
}
const EPOCH = createEpoch()
const EPOCH_YEAR = EPOCH.getFullYear()

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
		/** Create a Date from a year number (year 0 = our epoch) */
		fromYear: (year: number): number => {
			const date = new Date(EPOCH)
			date.setFullYear(EPOCH_YEAR + year)
			return date.getTime()
		},

		/** Get year number from a Date (relative to epoch) */
		toYear: (date: number): number => {
			return new Date(date).getFullYear() - EPOCH_YEAR
		},

		/** Format Date for display: "Jan 15, Year 42" */
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
			const month = months[new Date(date).getMonth()]
			const day = new Date(date).getDate()
			const year = TIME.date.toYear(date)
			return `${month} ${day}, Year ${year}`
		},

		/** Get difference between two dates in years */
		diffYears: (a: number, b: number): number => {
			return (a - b) / TIME.constants.yearMS
		},
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
		/**
		 * @param month - 0-11
		 * @returns 0-364
		 */
		days: (month: number) => {
			const daysPerMonth = TIME.constants.daysPerYear / 12
			const startDay = Math.floor(month * daysPerMonth)
			const endDay = Math.floor((month + 1) * daysPerMonth)
			return range(startDay, endDay)
		},
	},
	season: (month: number) => {
		const { winter, spring, summer, fall } = {
			winter: [10, 11, 0],
			spring: [1, 2, 3],
			summer: [4, 5, 6],
			fall: [7, 8, 9],
		}
		if (winter.includes(month)) return "winter"
		if (summer.includes(month)) return "summer"
		if (spring.includes(month)) return "spring"
		if (fall.includes(month)) return "autumn"
	},
}

export const START_DATE = TIME.date.fromYear(800)
