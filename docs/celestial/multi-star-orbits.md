# Multi-star orbits

A binary's stored stellar separation is the relative semimajor axis from one star to the other. Both stars complete one orbit in the Kepler period calculated from their total mass. Their paths about the barycenter divide the separation in inverse proportion to their masses.

A supported triple consists of the primary, its epistellar companion, and one wider companion directly attached to the primary in the catalog. The wider star's relative orbit is measured from the inner pair's barycenter. The inner pair moves as one component of the outer orbit while each inner star continues to orbit the inner barycenter.

## Planet placement

An isolated epistellar pair can host circumstellar planets around either star and circumbinary planets around their shared barycenter. The existing minimum orbit sets the inner edge of a circumstellar region. The Holman–Wiegert S-type fit caps its outer edge. The P-type fit sets the minimum circumbinary distance, increased as needed to clear each star's maximum barycentric excursion plus its minimum orbit. [Holman & Wiegert](https://doi.org/10.1086/300695)

The S-type fit uses the perturbing mass fraction from 0.1 through 0.9 and eccentricity from 0 through 0.8. The P-type fit uses the less massive component's fraction from 0.1 through 0.5 and eccentricity from 0 through 0.7. Unsupported and empty intervals contribute no capacity. Planetary orbits in these regions start circular and prograde in the corresponding binary's plane.

The allocation weights eligible regions by their spans in orbit-number units. Rejected regular slots contribute to the system's unplaced counts by type. A slot's physical properties are recalculated at its final distance after placement adjustments, and final masses must satisfy mutual-Hill spacing. Belt edges fit inside the same region. Trojans remain associated with accepted hosts.

In a triple, the outer orbit clears both the coplanar Mardling–Aarseth periapsis floor and each inner member's apoapsis plus pairwise Roche clearance. The outer S-type fit bounds planets around the wider star and around the inner group. For a planet orbiting an inner member, the generator subtracts that member's maximum excursion from the inner group's ceiling. This truncation approximates the two components of the outer orbit as point masses and applies even when the rolled stellar planes differ. [Mardling & Aarseth](https://doi.org/10.1046/j.1365-8711.2001.03974.x)

## Heating and display

A circumstellar planet uses its star's mass and luminosity. A circumbinary planet uses total mass for its period and Hill limits and a point source with the pair's summed luminosity for baseline heating. The primary owns its catalog entry, while the displayed orbit follows the pair's barycenter. Both view modes use a shared linear distance scale for resolved binaries and triples.

Wider-only binaries use their existing planetary regions. Other multiples retain the existing generation model. The fitted regions cover planets within the triple's two stellar components. Heating is phase independent, and eclipse forecasts and weather geometry use a single illuminator. The fits approximate long-term stability for the sampled configurations. They omit secular evolution and tidal circularization.
