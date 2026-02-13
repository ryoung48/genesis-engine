export const ARRAY = {
	unique: <T>(arr: T[]) => Array.from(new Set(arr)),
	range: (n: number) => Array.from({ length: n }, (_, i) => i),
	distribute: <Item>(params: {
		items: Item[]
		percentages: number[]
		buckets: [number, number][]
		neighbors: (_item: Item) => Item[]
		sorted?: (_items: Item[]) => Item[]
		score?: (_item: Item, _start: Item) => number
	}) => {
		const { items, percentages, buckets, neighbors, sorted, score } = params
		const N = items.length
		const smallestBucket = buckets.reduce(
			(minIdx, b, i, arr) => (b[0] < arr[minIdx][0] ? i : minIdx),
			0,
		)

		// Average sizes for each category
		const averageSizes = buckets.map((b) => (b[0] + b[1]) / 2)

		// Compute D (weighted average size)
		const D = percentages.reduce((sum, p, i) => sum + p * averageSizes[i], 0)

		// Total number of groups (M)
		const M = N / D

		// Initial number of groups in each category
		const categories = percentages.map((p) => Math.floor(M * p))

		// Adjust to ensure total groups sum to M (remainder to smallest bucket)
		const totalGroups = categories.reduce((sum, n) => sum + n, 0)
		const remainingGroups = Math.round(M) - totalGroups
		if (categories.length > 0) categories[smallestBucket] += remainingGroups

		// Generate group sizes with bucket tracking
		const groupsMeta = categories
			.map((n, i) =>
				ARRAY.range(n).map(() => ({
					size: window.dice.randint(...buckets[i]),
					bucket: i,
				})),
			)
			.flat()

		// Adjust sizes to sum exactly to N
		let total = groupsMeta.reduce((sum, g) => sum + g.size, 0)

		if (total > N) {
			let diff = total - N
			// Shrink groups towards their bucket minimums
			for (const g of groupsMeta) {
				if (diff <= 0) break
				const room = g.size - buckets[g.bucket][0]
				const reduction = Math.min(room, diff)
				g.size -= reduction
				diff -= reduction
			}
			// If still over, remove groups from smallest bucket
			while (diff > 0) {
				let removed = false
				for (let b = smallestBucket; b >= 0; b--) {
					const idx = groupsMeta.findIndex((g) => g.bucket === b)
					if (idx !== -1) {
						diff -= groupsMeta[idx].size
						groupsMeta.splice(idx, 1)
						removed = true
						break
					}
				}
				if (!removed) break
			}
			total = groupsMeta.reduce((sum, g) => sum + g.size, 0)
		}

		if (total < N) {
			let diff = N - total
			// Grow groups towards their bucket maximums (smallest groups first)
			for (let i = groupsMeta.length - 1; i >= 0; i--) {
				if (diff <= 0) break
				const g = groupsMeta[i]
				const room = buckets[g.bucket][1] - g.size
				const increase = Math.min(room, diff)
				g.size += increase
				diff -= increase
			}
			// If still under, add new groups to smallest bucket
			while (diff > 0) {
				const newSize = Math.min(buckets[smallestBucket][0], diff)
				groupsMeta.push({ size: newSize, bucket: smallestBucket })
				diff -= newSize
			}
		}

		// Sort descending so large groups get first pick of provinces
		groupsMeta.sort((a, b) => b.size - a.size)
		const groupSizes = groupsMeta.map((g) => g.size)

		// Create a set of unassigned items
		const unassignedItems = new Set(items)

		// Create assignments for later mapping
		const assignments = new Map<Item, number>()

		// Create the final result
		const groups: Item[][] = []

		// For each group size, create a group
		for (const groupSize of groupSizes) {
			const sortedItems = sorted
				? sorted([...unassignedItems])
				: [...unassignedItems]
			for (let attempt = 0; attempt < 20; attempt++) {
				// Pick a starting item
				const startingItem =
					attempt > 10 ? window.dice.choice(sortedItems) : sortedItems[attempt]
				if (!startingItem) break
				const groupItems = [startingItem]
				const visited = new Set([startingItem])

				// The frontier consists of reachable neighbors that are unassigned and not yet in the group
				const frontier: Item[] = []
				const addNeighborsToFrontier = (item: Item) => {
					const nextItems = neighbors(item)
					for (const nextItem of nextItems) {
						if (unassignedItems.has(nextItem) && !visited.has(nextItem)) {
							frontier.push(nextItem)
							visited.add(nextItem)
						}
					}
				}

				// Initialize frontier from starting item
				addNeighborsToFrontier(startingItem)

				while (groupItems.length < groupSize && frontier.length > 0) {
					// Sort the entire frontier to pick the absolute best candidate for the whole nation
					if (score && frontier.length > 1) {
						frontier.sort(
							(a, b) => score(b, startingItem) - score(a, startingItem),
						)
					}

					const bestItem = frontier.shift()!
					groupItems.push(bestItem)
					addNeighborsToFrontier(bestItem)
				}

				if (groupItems.length >= groupSize) {
					groups.push(groupItems)
					// Remove assigned items from unassigned pool
					for (const item of groupItems) {
						unassignedItems.delete(item)
						assignments.set(item, groups.length - 1)
					}
					break
				}
			}
		}

		// Leftover provinces become new independent groups (no inflation)
		for (const item of unassignedItems) {
			groups.push([item])
		}

		return { groups, unassigned: [] as Item[] }
	},
}
