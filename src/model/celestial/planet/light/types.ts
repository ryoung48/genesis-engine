export interface LightProfile {
	/** Linear flux ratio relative to Earth's own insolation (luminositySol /
	 * orbitalDistanceAU^2), geometric/clear-sky only -- NOT adjusted for cloud
	 * cover. This is the number a future solar-panel/agriculture consumer
	 * should read directly, not effectiveApparentMagnitude below. */
	irradianceRelativeToEarth: number
	/** World Builder's Handbook p.119's Star Apparent Magnitude formula,
	 * clear-sky (not cloud-adjusted). Lower (more negative) = brighter --
	 * Sol's own real value from Earth is -26.74. */
	apparentMagnitude: number
	/** apparentMagnitude further dimmed by this body's own average cloud
	 * cover -- the actual perceptual number poorlyLit/looksDark are
	 * classified from. Not a Handbook mechanic. */
	effectiveApparentMagnitude: number
	/** effectiveApparentMagnitude crosses the "poorly lit" threshold -- true
	 * whenever looksDark is also true, since dark is just the more extreme
	 * case of poor lighting. */
	poorlyLit: boolean
	/** effectiveApparentMagnitude crosses the "dark" threshold -- perpetual
	 * gloom even at local noon. */
	looksDark: boolean
}

export interface ComputeLightProfileInput {
	luminositySol: number
	orbitalDistanceAU: number
	cloudCoverFraction: number
}
