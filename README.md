# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

TODO:
* adding + removing moons
* test randomly generated systems
* multi star
* jovian moon main worlds


8wqaf
b29k1h - variation  1
b5ushj
x996lu - melter
tx8izx
tvizni
h8jpmj
kxbh64
iidgeg
cqobr8
odlezp
eli4k3
jdknt1

claude --resume a404dfe6-6132-4ad9-b386-0c162f2c8f5c << hist
claude --resume 743a3b51-aab0-4458-bd92-dc66828b5a32 << monsoons
codex resume 019f8775-0271-7a70-8d80-a58fe1d0b10b

claude --resume 4bc48604-7335-4e3b-a1c5-87270824c9e0 --dangerously-skip-permissions

~\AppData\Local\Temp\claude\C--Users-rayou-projects-nexus-chaos-machine\f0b6021 


claude --resume e60f57a7-0a1d-47d6-b7f2-70d6c833590d

## Exploring a world in Terran

In the Genesis map controls, open **Export**, select **Terran**, and choose **Export Terran world**. In Terran, choose **Import Chaos Machine world**, open the `.terran` file, and pick a location to explore. The file carries elevation, Köppen classes, monthly temperature and rainfall, lakes, river paths with discharge, and marsh coverage.

## References

Work this project draws on directly. Add an entry here whenever a committed change is built on a clear outside source.

- **Pictogrammers, Material Design Icons** ([ruler](https://pictogrammers.com/library/mdi/icon/ruler/), [map-marker-path](https://pictogrammers.com/library/mdi/icon/map-marker-path/)). Icons for the measurement controls.

- **World Orogen** ([planet generator](https://orogen.studio/generate), [source](https://github.com/raguilar011095/planet_heightmap_generation)). Visual reference for map-edge coordinate labels, and (`v2/js/present/belts.js`, `v2/js/terrain/records.js`, commit `ed466f9db71292e912d8d0160e689a67a994f2d9`) the island-arc, split-arc back-arc sea, Sunda-block and arc-height rules the arc crust stage ports; see [island arcs](docs/terrestrial/island-arcs.md). Also the present-day records stages (`v2/js/present/*.js`: crust raster, belts, past replay, geologic record, bent pieces, range shapes) and `v2/js/terrain/volcanoes.js` (volcano edifices) that the tectonics records and volcano stamps port; see [tectonics records](docs/terrestrial/tectonics.md) and [volcanoes](docs/terrestrial/volcanism.md). Also the rock and soil rules (`v2/js/geology/rocks.js`, `geology-config.js`, `v2/js/finish/finish-sediment.js`, `finish-wind.js`, `finish-ice.js`, `finish-config.js`, `v2/js/farming/farming.js`, `farming-config.js`, same commit) that the surface rock kinds, young sediment and soil fertility port; see [rocks and soil](docs/terrestrial/rocks-and-soil.md). Licensed GPL-3.0, as is this project.
- **Hartmann and Moosdorf (2012), GLiM, the Global Lithological Map** ([PANGAEA](https://doi.pangaea.de/10.1594/PANGAEA.788537)). Earth's share of sediments, metamorphics, plutonics and volcanics, read against our rock family shares in [rocks and soil](docs/terrestrial/rocks-and-soil.md); never used in the model.
- **USGS, loess as a Quaternary paleoenvironmental indicator** ([page](https://www.usgs.gov/publications/loess-a-quaternary-paleoenvironmental-indicator)) and the **Global Unconsolidated Sediments Map** ([GUM](https://www.geo.uni-hamburg.de/en/geologie/forschung/aquatische-geochemie/gum.html)). Earth's loess, glacial and alluvial shares of land, read against our young-sediment shares; never used in the model.
- **World Orogen, groundwater and terminal-lake pull request** ([pull request 152](https://github.com/raguilar011095/planet_heightmap_generation/pull/152), commit `66c3948fd31221cb254877c9b4ce925f4cdb92b7`: `finish-hydro.js`, `finish-config.js`, `finish-groundwater.js`). The terminal-lake balance, the rock permeability and soil texture tables, the wetland thresholds, and the spring and oasis classes that the groundwater stage ports; see [rivers and lakes](docs/terrestrial/rivers-and-lakes.md) and the [groundwater overview](docs/terrestrial/groundwater/overview.md). Licensed GPL-3.0, as is this project.
- **Songs of the Eons** ([SongsOfFOSS, MIT](https://github.com/SongsOfFOSS), `libsote/rock-qualities.lua`). Soil texture by rock type for hydraulic soil, mapped to our rock kinds as the pull request maps it; see [hydraulic soil](docs/terrestrial/groundwater/hydraulic-soil.md).
- **NPS, caves and karst** ([Cave and karst](https://www.nps.gov/subjects/caves/index.htm), [Types of caves](https://www.nps.gov/subjects/caves/types-of-caves.htm)) and **Goldscheider et al. (2020), "Global distribution of carbonate rocks and karst water resources"**, Hydrogeology Journal 28: 1661-1677, doi:10.1007/s10040-020-02139-5. The cave types (solution, sinkhole, grotto, lava tube, sea, talus, glacier) and the carbonate and evaporite karst kinds; see [karst and caves](docs/terrestrial/karst-and-caves.md).
- **Data Bayou, "Map of Caves in the USA"**. The reference for the karst classes (short, long, pseudo, absent, no karst) and for the density of notable cave dots; never used in the model.
- **Hayes (1979), "Barrier island morphology as a function of tidal and wave regime"**, in Leatherman (ed.), *Barrier Islands*, Academic Press, pp. 1-27 ([reference entry](https://rd.springer.com/referenceworkentry/10.1007/1-4020-3880-1_25)). The wave-energy classes (medium energy 0.6 to 1.5 m) behind the shore exposure classes; see [shoreline](docs/terrestrial/shoreline.md).
- **USACE, *Coastal Engineering Manual* (2002), EM 1110-2-1100, Part II Chapter 2** ([page](https://coastalengineeringmanual.tpub.com/Part-II-Chap2/index.htm)). Fetch-limited wave growth and the effective-fetch average over radials, in the ocean waves and shore exposure; see [marine conditions](docs/climate/marine-conditions.md) and [shoreline](docs/terrestrial/shoreline.md).
- **Fan, Li & Miguez-Macho (2013), "Global patterns of groundwater table depth"**, Science 339(6122): 940-943, doi:10.1126/science.1229881. The transmissivity e-folding depth, frost factor and wetland depth threshold; see [water table](docs/terrestrial/groundwater/water-table.md).
- **Gleeson et al. (2011), "Mapping permeability over the surface of the Earth"**, Geophysical Research Letters 38, L02401, doi:10.1029/2010GL045565. Rock permeability classes.
- **Doll & Fiedler (2008), "Global-scale modeling of groundwater recharge"**, Hydrology and Earth System Sciences 12: 863-885. The factors behind recharge from runoff, and the global recharge total read against ours.
- **Scanlon et al. (2006), "Global synthesis of groundwater recharge in semiarid and arid regions"**, Hydrological Processes 20: 3335-3370. Arid recharge is mostly focused beneath channels; stream-bed loss rate.
- **Wilson & Guan (2004), "Mountain-block hydrology and mountain-front recharge"**, in *Groundwater Recharge in a Desert Environment: The Southwestern United States*, AGU Water Science and Application 9. The range of mountain-block recharge that bounds the regional flux share.
- **Andreadis, Schumann & Pavelsky (2013), "A simple global river bankfull width and depth database"**, Water Resources Research 49: 7164-7168. Channel width from discharge.
- **Cosby et al. (1984), "A statistical exploration of the relationships of soil moisture characteristics to the physical properties of soils"**, Water Resources Research 20(6): 682-690, doi:10.1029/WR020i006p00682. Saturated conductivity from sand and clay.
- **Montgomery & Dietrich (1992), "Channel initiation and the problem of landscape scale"**, Science 255(5046): 826-830, doi:10.1126/science.255.5046.826. Hillslope lengths bounding the stream spacing floor.
- **Osland et al. (2017), mangrove range limits and freeze events**, Global Change Biology. The coldest-month threshold for mangroves.
- **Gallego-Sala & Prentice (2013), "Blanket peat biome endangered by climate change"**, Nature Climate Change 3: 152-155. Climate limits of peat accumulation, as a guide for the peat and meadow thresholds.
- **Nardi et al. (2019), GFPLAIN250m, a global high-resolution dataset of Earth's floodplains**, Scientific Data 6. Floodplain width scale, as a guide.
- **Bredehoeft (1997), "Safe yield and the water budget myth"**, Ground Water 35: 929-931. Why well yield is held under recharge.

- **Courtillot, Davaille, Besse & Stock (2003), "Three distinct types of hotspots in the Earth's mantle"**, Earth and Planetary Science Letters 205(3–4): 295–308, doi:10.1016/S0012-821X(02)01048-8. A handful of primary deep-mantle plumes, thousands of km apart; the plume count and spacing; see [volcanoes](docs/terrestrial/volcanism.md).
- **Sharp & Clague (2006), "50-Ma initiation of Hawaiian-Emperor bend records major change in Pacific plate motion"**, Science 313(5791): 1281–1284, doi:10.1126/science.1128489. Age of the Hawaiian-Emperor chain (about 80 Myr to its oldest seamounts) that sets the hotspot track length; see [volcanoes](docs/terrestrial/volcanism.md).
- **Ernst (2014), *Large Igneous Provinces***, Cambridge University Press, ISBN 978-0-521-87178-1. Sizes and ages of flood basalt provinces; see [volcanoes](docs/terrestrial/volcanism.md).

- **Scotese (2021), "An Atlas of Phanerozoic Paleogeographic Maps: The Seas Come In and the Seas Go Out"**, Annual Review of Earth and Planetary Sciences 49 ([record](https://www.researchgate.net/publication/350321168_An_Atlas_of_Phanerozoic_Paleogeographic_Maps_The_Seas_Come_In_and_the_Seas_Go_Out)). Flooded continental area peaked at about a third of the continents; the check on the epeiric share; see [tectonics record](docs/terrestrial/tectonics-record.md).
- **Ronov's estimate of sedimentary cover, via the National Academies** ([chapter](https://www.nap.edu/read/1345/chapter/13)). Sedimentary rocks cover about 80% of the land surface, and Precambrian rocks are at or near the surface in about 10% of the conterminous United States; the check on cover and bare shield shares.
- **Uyeda & Kanamori (1979), "Back-arc opening and the mode of subduction"**, Journal of Geophysical Research 84(B3): 1049–1061, doi:10.1029/JB084iB03p01049. The two end-member subduction styles (squeezed Andean margin versus a split-off arc with a sea behind it) behind the margin split chance; see [island arcs](docs/terrestrial/island-arcs.md).
- **Parsons & Sclater (1977), "An analysis of the variation of ocean floor bathymetry and heat flow with age"**, Journal of Geophysical Research 82(5): 803–827, doi:10.1029/JB082i005p00803. Half-space cooling depth of back-arc sea floor; see [island arcs](docs/terrestrial/island-arcs.md).
- **Piperno, Ranere, Holst, Iriarte & Dickau (2009), "Starch grain and phytolith evidence for early ninth millennium B.P. maize from the Central Balsas River Valley, Mexico"**, PNAS 106(13): 5019–5024, doi:10.1073/pnas.0812525106 ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2664064)). Maize by 8,700 cal BP; with Kennett et al. 2020 it sets the farming dependence lag; see [farming](docs/terrestrial/population/farming.md).
- **Kennett et al. (2020), "Early isotopic evidence for maize as a staple grain in the Americas"**, Science Advances 6: eaba3245 ([record](https://digitalcommons.usf.edu/kip_articles/5878)). Maize a staple after about 4,000 cal BP; sets the farming dependence lag.
- **Sandom et al. (2014), "Global late Quaternary megafauna extinctions linked to humans, not climate change"**, Proceedings of the Royal Society B 281: 20133254, doi:10.1098/rspb.2013.3254 ([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4071532/)). Extinction severity tracks hominin palaeobiogeography and is lowest in sub-Saharan Africa; the basis for herding only with animals from the migration origin's landmass; see [farming](docs/terrestrial/population/farming.md).
- **Vigne et al. (2012), "First wave of cultivators spread to Cyprus at least 10,600 y ago"**, PNAS 109(22): 8445–8449, doi:10.1073/pnas.1201693109, and **Zeder (2008), "Domestication and early agriculture in the Mediterranean Basin"**, PNAS 105(33): 11597–11604. Sheep, goats, cattle and pigs reach Cyprus by about 8500 BCE; the first livestock voyage knot (80 km); see [farming](docs/terrestrial/population/farming.md).
- **Blench (2007), "New palaeozoogeographical evidence for the settlement of Madagascar"**, Azania 42: 69–82, and **Boivin et al. (2013), "East Africa and Madagascar in the Indian Ocean world"**, Journal of World Prehistory 26: 213–281. Zebu cattle cross the Mozambique Channel by about 1000 CE; the second livestock voyage knot (400 km); see [farming](docs/terrestrial/population/farming.md).
- **Crosby (1972), *The Columbian Exchange: Biological and Cultural Consequences of 1492***, Greenwood. Livestock cross the Atlantic from 1493, the open-ocean livestock voyage knot, and crops follow, which ends the farming dependence lag; see [farming](docs/terrestrial/population/farming.md).
- **Nunn and Qian (2010), "The Columbian Exchange: A History and Assessment of Its Effects"**, *Journal of Economic Perspectives* 24(2): 163–188. New World crops became staples in the Old World within a century or two of 1500; the crop exchange cut-off of the farming dependence lag, see [farming](docs/terrestrial/population/farming.md).
- **Haines (1938), "Where did the Plains Indians get their horses?"**, American Anthropologist 40: 112–117, and **Roe (1955), *The Indian and the Horse***, University of Oklahoma Press. The spread of the horse across the Plains at about 30 km/yr; the colonial herd front speed; see [farming](docs/terrestrial/population/farming.md).
- **Umut Comak, Kron’thul** ([font announcement](https://www.reddit.com/r/callofcthulhu/comments/1kucc4m)). Visual reference for the carved procedural script style.
- **NASA JPL, Approximate Positions of the Planets** ([Keplerian elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html)). Source for the eight Solar System planets' approximate J2000 starting phases and orbital orientations.
- **Sangil Lee, solar system simulator** ([sangillee.com](https://sangillee.com), [How to create the solar system](https://sangillee.com/2024-02-16-how-to-create-the-solar-system/)). The inspiration for the solar-system view's fading orbit trails, its readable (symbolic) layout versus a true-scale layout, its moon spacing, and the star's bloom flare.
- **Eggleton (1983), "Approximations to the radii of Roche lobes"**, ApJ 268, 368 ([ADS](https://ui.adsabs.harvard.edu/abs/1983ApJ...268..368E)). The Roche-lobe fraction used for the closest two stars can pass.
- **Holman & Wiegert (1999), "Long-Term Stability of Planets in Binary Systems"**. Empirical circumstellar and circumbinary generation limits. [Paper](https://doi.org/10.1086/300695) · [Multi-star orbit model](docs/celestial/multi-star-orbits.md)
- **Mardling & Aarseth (2001), "Tidal interactions in star cluster simulations"**. The periapsis floor used for hierarchical triple spacing. [Paper](https://doi.org/10.1046/j.1365-8711.2001.03974.x)
- **Mongoose Traveller, World Builder's Handbook**. The star, companion-star and orbit generation tables and rules the celestial model follows.
- **Bröde et al. (2012), “Deriving the operational procedure for the Universal Thermal Climate Index (UTCI)”** ([paper and polynomial coefficients](https://doi.org/10.1007/s00484-011-0454-1)). The shade UTCI used for the Misery Index and feels-like temperature.
- **Vidal et al. (2022), "Age of the oldest known Homo sapiens from eastern Africa"**, Nature 601, 579 ([paper](https://doi.org/10.1038/s41586-021-04275-8)). Places the Omo Kibish origin (about 36°E, 5°N) used as the start of the Earth import's migration search.

- **Cherry (1990), "The first colonization of the Mediterranean islands: a review of recent research"**, Journal of Mediterranean Archaeology 3, 145, and **Cherry & Leppard (2018), "Patterning and its causation in the pre-Neolithic colonization of the Mediterranean islands"**, Journal of Island and Coastal Archaeology 13, 191. Small Mediterranean islands show no secure foraging settlement before the Holocene; the basis for delaying dead-end small islands in the migration arrival field.
- **Walker et al. (2009), "Formal definition and dating of the GSSP (Global Stratotype Section and Point) for the base of the Holocene"**, Journal of Quaternary Science 24, 3 ([paper](https://doi.org/10.1002/jqs.1227)). The 11,700 BCE Holocene start used as the earliest year small islands can be settled.
- **Klein Goldewijk, Beusen, Doelman & Stehfest (2017), "Anthropogenic land use estimates for the Holocene – HYDE 3.2"**, Earth System Science Data 9, 927 ([paper](https://doi.org/10.5194/essd-9-927-2017), [data](https://doi.org/10.17026/dans-25g-gez3)). World population by year, the reference for the farming density calibration.
- **Klein Goldewijk, Beusen & Janssen (2010), "Long-term dynamic modeling of global population and built-up area in a spatially explicit way: HYDE 3.1"**, The Holocene 20(4), 565-573 ([paper](https://doi.org/10.1177/0959683609356587)). The population density bins and legend colors of the Population Density map mode.
- **Upstream PR #88, farming hearths and spread**, `raguilar011095/planet_heightmap_generation` at commit `632f0ec675d1d61b6d131514a923e25b59601840` ([repository](https://github.com/raguilar011095/planet_heightmap_generation)). The documented odds factors, speeds and capacities that the farming field adapts, and (commit `ed466f9db71292e912d8d0160e689a67a994f2d9`) the slope-loss and terrace rules behind the plough and terrace ground factors; see [farming](docs/terrestrial/population/farming.md).
- **Zimmermann, Hilpert & Wendt (2009), "Estimations of population density for selected periods between the Neolithic and AD 1800"**, Human Biology 81(2–3): 357–380, doi:10.3378/027.081.0313 ([paper](https://doi.org/10.3378/027.081.0313)). European prehistoric population densities behind the stateless farmer and herder TL cap anchors; see [tech levels](docs/terrestrial/population/tech-levels.md).
- **Lieth (1975), "Modeling the primary productivity of the world"**, in Primary Productivity of the Biosphere. The Miami model for net primary productivity.
- **Walsh & Lawler (1981), "Rainfall seasonality: description, spatial patterns and change through time"**, Weather 36, 201. The rain seasonality index.
- **Matranga (2024), "The Ecological Origins of Agriculture"**. Temperature seasonality and earlier adoption of agriculture.
- **Larson et al. (2014), "Current perspectives and the future of domestication studies"**, PNAS 111, 6139 ([paper](https://doi.org/10.1073/pnas.1323964111)). The domestication periods that bound the hearth schedule.
- **Ammerman & Cavalli-Sforza (1971), "Measuring the rate of spread of early farming in Europe"**, Man 6, 674. The Neolithic front speed.
- **Pinhasi, Fort & Ammerman (2005), "Tracing the origin and spread of agriculture in Europe"**, PLoS Biology 3, e410 ([paper](https://doi.org/10.1371/journal.pbio.0030410)). The dated early Neolithic sites and front speed used by the Earth diagnostic.
- **Marlowe (2005), "Hunter-gatherers and human evolution"**, Evolutionary Anthropology 14, 54. Forager population densities.
- **Lot (1929), "L'etat des paroisses et des feux de 1328"**, Bibliotheque de l'Ecole des Chartes 90, 51. The hearth survey behind the farming capacity per km2.
- **Middleton & Thomas (1997), World Atlas of Desertification, 2nd ed.**, UNEP. The aridity index classes.
- **Vecellio et al. (2022), "Evaluating the 35°C wet-bulb temperature adaptability threshold for young, healthy subjects (PSU HEAT Project)"**, Journal of Applied Physiology 132 ([paper](https://doi.org/10.1152/japplphysiol.00738.2021)). The 31 °C critical wet bulb behind the heat gate; see [habitability](docs/climate/habitability.md).
- **Sherwood & Huber (2010), "An adaptability limit to climate change due to heat stress"**, PNAS 107, 9552 ([paper](https://doi.org/10.1073/pnas.0913352107)). The 35 °C theoretical wet-bulb ceiling.
- **Allen et al. (1998), FAO Irrigation and Drainage Paper 56, Crop evapotranspiration**, equation 8 ([FAO](https://www.fao.org/4/x0490e/x0490e00.htm)). The psychrometric constant in the wet-bulb solve.
- **Stull (1947), "Vapor pressure of pure substances"**, via the [NIST Chemistry WebBook](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7732185&Mask=4&Type=ANTOINE&Plot=on) Antoine constants for water. The boiling point at the surface pressure.
- **Butzer (1976), Early Hydraulic Civilization in Egypt**. Irrigated population density in the Nile valley.
- **Bocquet-Appel & Naji (2006), "Testing the Hypothesis of a Worldwide Neolithic Demographic Transition: Corroboration from American Cemeteries"**, Current Anthropology 47: 341–365. The share of immature skeletons rises by 20–30% over 500–700 years from the Mesolithic to the Neolithic. Sets `RAMP_YEARS`, behind the farming adoption lag; see [farming](docs/terrestrial/population/farming.md).
- **Southern African foraging-to-herding transition (2014)**, PLoS ONE. The herding spread rate of about 2.4 km per year.
- **Rowley-Conwy, forager-farmer frontier chapter**. The roughly 1,500-year forager-farmer frontier in northern Europe behind the forager hold decay.
- **Okabe & Ito (2008), "Color Universal Design"**. The colour-blind-safe palette of the Way of life map mode.
- **Brewer & Harrower, ColorBrewer 2.0**, Apache License 2.0 ([site](https://colorbrewer2.org)). The 11-class Spectral diverging ramp behind the tech level colour scale, as published in d3-scale-chromatic.
- **ArchaeoGLOBE Project (2019), "Archaeological assessment reveals Earth's early transformation through land use"**, Science 365, 897 ([data](https://doi.org/10.7910/DVN/NJVHQL)). Expert land-use ratings that the Earth diagnostic compares with.
- **GURPS Basic Set, 4th edition (2004)**, Steve Jackson Games ([books](https://www.sjgames.com/gurps/books/basic/)). The TL0–TL12 tech-level ladder, its rung names and start dates; see [tech levels](docs/terrestrial/population/tech-levels.md).
- **Morris (2013), *The Measure of Civilization***, Princeton University Press ([book](https://press.princeton.edu/books/hardcover/9780691155685/the-measure-of-civilization)). Energy capture per person behind the watts-per-person ladder.
- **Kardashev (1964), "Transmission of Information by Extraterrestrial Civilizations"**, Soviet Astronomy 8, 217 ([ADS](https://ui.adsabs.harvard.edu/abs/1964SvA.....8..217K)), and **Sagan (1973), *The Cosmic Connection***, which interpolates it as K = (log10 W − 6) / 10 ([scale](https://en.wikipedia.org/wiki/Kardashev_scale)). The world power index.
- **Kander, Malanima & Warde (2013), *Power to the People: Energy in Europe over the Last Five Centuries***, Princeton University Press ([book](https://press.princeton.edu/books/hardcover/9780691143620/power-to-the-people)). The pre-industrial north–south energy gap is mostly heating fuel, so heating is left out of the tech measure.
- **Ashraf & Galor (2011), "Dynamics and Stagnation in the Malthusian Epoch"**, American Economic Review 101(5), 2003 ([paper](https://doi.org/10.1257/aer.101.5.2003)). Before industry, technology shows up as population density; the basis for skewing province tech level toward dense land.
- **Comin, Easterly & Gong (2010), "Was the Wealth of Nations Determined in 1000 BC?"**, American Economic Journal: Macroeconomics 2(3), 65 ([paper](https://doi.org/10.1257/mac.2.3.65)). Technology gaps persist and are only partly explained by density; keeps the density weight well below 1.
- **Pomeranz (2000), *The Great Divergence***, Princeton University Press ([book](https://press.princeton.edu/books/paperback/9780691090108/the-great-divergence)), and the **Maddison Project Database 2020** ([data](https://www.rug.nl/ggdc/historicaldevelopment/maddison/releases/maddison-project-database-2020)). The widest tech-level spread around 1900.
- **United Nations, World Population Prospects 2024** ([data](https://population.un.org/wpp/)) and **World Urbanization Prospects 2018** ([data](https://population.un.org/wup/)). The world population plateau and modern urban shares and city sizes.
- **Bairoch (1988), *Cities and Economic Development***, University of Chicago Press, and **Chandler (1987), *Four Thousand Years of Urban Growth***, Edwin Mellen Press ([catalogue](https://openlibrary.org/search?q=Four+Thousand+Years+of+Urban+Growth)). Historical urban shares and the largest city at each tech level.
- **Kelly (2013), *The Lifeways of Hunter-Gatherers: The Foraging Spectrum***, Cambridge University Press ([book](https://doi.org/10.1017/CBO9781139176132)). Forager population densities by environment; the anchors for the density-scaled forager tech-level cap; see [tech levels](docs/terrestrial/population/tech-levels.md).
- **Comin & Hobijn (2010), "An Exploration of Technology Diffusion"**, American Economic Review 100(5): 2031–2059, doi:10.1257/aer.100.5.2031 ([paper](https://doi.org/10.1257/aer.100.5.2031)). Average adoption lag of about 45 years across 104 technologies, from over a century to about a decade; calibrated the deferred contact-lag front; see [tech levels](docs/terrestrial/population/tech-levels.md).
- **Scheidel & Meeks, ORBIS: The Stanford Geospatial Network Model of the Roman World** ([orbis.stanford.edu](https://orbis.stanford.edu)). Sailing ships at 60-90 km/day against 20-30 km/day overland; the sea-to-land speed ratio of the deferred contact-lag front; see [tech levels](docs/terrestrial/population/tech-levels.md).
