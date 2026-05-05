export function createDrawerNationClickHandler(params: {
	openDetailsDrawer: () => void
	focusOnNation: (nationId: number) => void
}): (nationId: number) => void {
	const { openDetailsDrawer, focusOnNation } = params
	return (nationId: number) => {
		openDetailsDrawer()
		focusOnNation(nationId)
	}
}
