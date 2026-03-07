# Procedural State Generation System (800–1800)

Every state is defined by four independent axes: **`Legitimacy : Power :: Administration :: Economy`**

Axes are mechanically decoupled. A revolution may change Legitimacy without touching Administration. Centralization may change Administration without touching Power.

---

## Legitimacy (Why does this state exist?)

Drives: succession, diplomatic affinity, baseline population loyalty.

| Type | Source | Key Mechanic |
|---|---|---|
| **Monarchy** | Dynastic right, bloodline, divine right | Stability tied to clear heir. High affinity with other monarchies. |
| **Republic** | Legal charter, citizenship, public mandate | No heir crises. Vulnerable to factionalism and gridlock. |
| **Theocracy** | Religious authority, divine revelation | High cohesion. Severe unrest from religious minorities under rule. |
| **Tribal** | Kinship, clan, ancestral land | Resilient to decapitation — loyalty follows clan, not borders. |
| **Corporate** | Charter, monopoly, capital consolidation | Zero innate loyalty. Highest wealth extraction. Mercenary-dependent. |
| **Revolutionary** | Active overthrow, new social contract | Massive military morale (levée en masse). Diplomatic pariah. Destabilizes neighbors. |

---

## Power (Who decides?)

Drives: action speed, law/war/spending decisions, vulnerability to bad rulers.

| Type | Distribution | Key Mechanic |
|---|---|---|
| **Absolute** | Single individual, unchecked | Instant action. Efficiency = ruler's stats (high variance). |
| **Diarchic** | Two co-equal executives, mutual veto | High tyranny resistance. Action speed halved. |
| **Oligarchic** | Small elite council | Moderate speed. Efficiency averaged across council (low variance). |
| **Democratic** | Broad assembly or mass vote | Slowest action. Vulnerable to populism. Passive bonuses to innovation and tax willingness. |
| **Interregnum** | No recognized executive | *Temporary crisis state.* Triggers succession wars, power vacuums. Should resolve or collapse. |

- consider dynastic for theocratic god kings

---

## Administration (How does the state operate?)

Drives: state capacity, power projection, tax extraction, geographic scalability.

| Type | Mechanism | Key Mechanic |
|---|---|---|
| **Bureaucratic** | Standardized law, appointed magistrates, central treasury | Max tax extraction and capacity. Expensive. Treasury bankruptcy = immediate collapse. |
| **Patronage** | Ruler's personal household, favorites, cronies | Cheap. High corruption. Scales with ruler's charisma. |
| **Martial** | Military districts, generals as governors | Massive defense bonus. Low military upkeep. Very high coup probability. |
| **Feudal** | Contractual obligation, land grants for military quotas | Low central income. Vassal levies, not standing army. Every lord defends independently — resilient to invasion. |
| **Confederate** | Voluntary alliance of autonomous hubs | Near-zero central authority. Fast local growth. Incapable of unified offense or grand strategy. |

---

## Economy (What generates wealth?)

Drives: taxation, geographic interaction, demographic growth, strategic posture.

| Type | Source | Key Mechanic |
|---|---|---|
| **Pastoral** | Livestock herds, grazing lands | Low density, poor urban growth. High mobilization ratio. Wealth is mobile — can migrate if invaded. |
| **Agrarian** | Land, agricultural surplus, rural density | High baseline production/manpower. Low cash. Weather-dependent (drought = crisis). |
| **Mercantile** | Trade routes, banking, tariffs, monopolies | High cash, low manpower. Punches above weight via mercenaries. Vulnerable to blockade/embargo. |
| **Raiders** | Plunder, tribute, extractive vassalage | High military morale, fast mobilization, burst wealth from victory. Severe long-term tech/growth penalties. Stagnation or defeat = rapid collapse into civil war. |
| **Plantation** | Single cash crop or mineral for export, coerced labor | Massive concentrated trade value. Monoculture vulnerability (price crash = income crash). High baseline unrest. Must import food. |
| **Industrial** | Private ownership, market allocation, factory-scale production | Highest raw wealth generation. Rapid urbanization and demographic shift. Requires capital markets and labor supply. Generates class tension (labor unrest scaling with inequality). |


--
To effectively model the 800–1800 timeline in a simulation, you don't need a year-by-year array. Instead, you can divide this millennium into four distinct "Epochs." By attaching dynamic spawn weights to your Legitimacy tags during these epochs, you create a perfectly paced historical arc.

Over this millennium, you are essentially simulating the global transition from **kinship and faith** to **centralized dynastic power**, and finally to **capital and ideology**.

Here is how the broad strokes of that distribution change over time.

### Epoch 1: The Fragmentation Era (800 – 1100)

*The world is recovering from the collapse of classical antiquity. State capacity is incredibly low, and survival depends on local loyalty or religious zeal.*

* **`Tribal` (High Weight - ~40%):** This is the golden age of the tribal state. The Eurasian Steppe, the Americas, Sub-Saharan Africa, and Northern Europe (the Viking Age) are dominated by massive, highly mobile clan networks.
* **`Monarchy` (High Weight - ~45%):** The default sedentary state, though they are highly fragile and usually rely on `feudal` or `patronage` administration. Think of the Carolingian Empire or the Tang Dynasty in its twilight.
* **`Theocracy` (Medium Weight - ~10%):** Very prominent as a unifying force. The Papal States are establishing earthly power, and the early Islamic Caliphates are deeply fusing religious and political legitimacy.
* **`Republic` (Trace Weight - ~5%):** Almost nonexistent outside of a few anomalous coastal hubs like Venice or early Amalfi that survived the Roman collapse.
* **`Corporate` / `Revolutionary` (0%):** The legal and economic infrastructure for these simply does not exist yet.

### Epoch 2: The Consolidation & Trade Era (1100 – 1500)

*Agricultural output explodes, populations urbanize, and trade networks reconnect the globe. Sedentary empires strike back against the nomads.*

* **`Monarchy` (Dominant Weight - ~60%):** Monarchies begin to centralize and crush their local lords. The Mongols sweep across the globe as a `Tribal` force, but almost immediately settle down and convert their conquests into massive `Monarchy` or `Theocracy` states (like the Ilkhanate or Yuan Dynasty).
* **`Republic` (Rising Weight - ~15%):** This is the era of the Merchant Republic. The Hanseatic League dominates the Baltic, Novgorod rules Russia's north, and the Italian City-States (Florence, Genoa, Siena) invent modern banking.
* **`Tribal` (Falling Weight - ~15%):** Still vast in territorial control (the Americas, the Steppe), but shrinking in geopolitical influence as sedentary states build better walls and gunpowder weapons.
* **`Theocracy` (Peaking Weight - ~10%):** The era of the Crusades and Holy Orders. You see bizarre, highly effective states like the Teutonic Order and the Knights Hospitaller carving out permanent territories.
* **`Corporate` / `Revolutionary` (0%):** Still locked behind technological and institutional prerequisites.

### Epoch 3: The Age of Sail & Absolutism (1500 – 1750)

*Gunpowder, the printing press, and the discovery of the New World shatter the old medieval order. Power centralizes violently.*

* **`Monarchy` (Absolute Peak - ~70%):** The era of the mega-empire. Ming/Qing China, the Ottoman Empire, the Spanish Empire, and Bourbon France. The "Divine Right of Kings" reaches its zenith, and monarchies begin wiping smaller state types off the map.
* **`Corporate` (The New Contender - ~10%):** *Trigger Condition Met.* Starting around 1600, joint-stock companies are invented. Within a century, entities like the Dutch East India Company (VOC) and British East India Company (EIC) are acting as sovereign states, ruling millions of people across Indonesia and India.
* **`Republic` (Consolidating - ~10%):** The dozens of tiny medieval republics are conquered by monarchies. However, the ones that survive become incredibly dense and powerful, like the Dutch Republic or the Old Swiss Confederacy.
* **`Tribal` (Plummeting Weight - ~8%):** Disease, colonialism, and gunpowder empires push tribal states to the extreme margins of the map.
* **`Theocracy` (Collapsing - ~2%):** The Protestant Reformation and the rise of secular statecraft effectively end the creation of new theocracies. Holy orders are secularized or destroyed.

### Epoch 4: The Age of Upheaval (1750 – 1800)

*Industrialization begins, and the massive, top-heavy absolute monarchies begin to fracture under the weight of Enlightenment philosophy and the printing press.*

* **`Monarchy` (High but highly volatile - ~60%):** Still the undisputed ruler of the map, but their Axis 2 (Administration) is being forced to shift. To survive, they must adopt `statutory` (constitutional) constraints or face collapse.
* **`Revolutionary` (The New Contender - ~5%):** *Trigger Condition Met.* As the printing press disseminates radical ideas, the American and French Revolutions spawn a completely new type of ideological state. They are few in number but generate massive geopolitical chaos.
* **`Corporate` (Maximum Territorial Peak - ~15%):** The EIC practically owns the entire Indian subcontinent, fielding a private army twice the size of the British government's army. It is the peak of corporate sovereignty before they are nationalized in the 1800s.
* **`Republic` (Ideological Resurgence - ~15%):** Republics transition from being just "oligarchic merchant hubs" to massive, ideologically driven nation-states.
* **`Tribal` & `Theocracy` (Marginalized - <5%):** Functionally relegated to the periphery of global politics by the end of the 18th century.

---

### Implementing This in a Generator

If you are writing the spawning logic for this, you can set up a system where the base array of weights changes based on a `currentYear` variable.

For example, a `spawnState()` function could look at the year 1650, see that `Corporate` has unlocked, apply its 10% weight, and roll the dice. If it hits, it then rolls on the valid Power, Administration, and Economy axes we defined earlier.

Would you like to look at how the weights for **Axis 2 (Administration)**—like the shift from `Feudal` to `Bureaucratic`—overlay onto this exact same timeline?