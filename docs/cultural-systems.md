# Cultural Systems

Cultural systems model the non-political aspects of civilization—shared identity, traditions, and beliefs that persist across political boundaries and shape how populations interact. The hierarchy moves from specific to general: provinces belong to cultures, cultures belong to heritages, cultures practice faiths, and faiths belong to religions.

## Cultures & Heritages

### Cultures

Cultures are regional groupings that represent shared language, customs, and identity. They are the primary cultural identifier for provinces.

**Generation parameters:**
- Density: ~1 culture per 8 provinces
- Seeding: Random locations with spacing constraints
- Spread: Flood-fill diffusion to neighboring provinces

### Why Cultures?

Cultures serve several simulation purposes:

1. **Identity persistence**: Cultures survive political change—a conquered province retains its culture
2. **Unrest potential**: Ruling over foreign cultures could create instability (TODO)
3. **Diplomatic modifier**: Same-culture nations may be friendlier (TODO)
4. **Visual diversity**: Culture-based naming and aesthetics differentiate regions

### Culture Spread Mechanics

Cultures spread from seed points via flood-fill:

```
while unassigned_provinces exist:
    for each culture:
        expand to adjacent unassigned provinces
```

This creates organic, blob-shaped cultural regions with boundaries that follow geographic features (since provinces themselves follow geography).

**Design justification**: The flood-fill approach approximates how real cultures spread—through contact with neighbors, gradually expanding until meeting resistance from other cultures.

### Heritages

Heritages are meta-groupings of cultures representing deeper historical/ethnic lineages. Multiple cultures can share a heritage while maintaining distinct identities.

**Generation parameters:**
- Density: ~1 heritage per 6 cultures
- Assignment: Hierarchical clustering
- Spread: From seed cultures to neighbors

### Heritage Purpose

Heritages enable:

1. **Broader groupings**: "Germanic peoples" containing multiple distinct cultures
2. **Historical depth**: Cultures diverged from common ancestors
3. **Diplomatic potential**: Heritage-mates may cooperate more readily (TODO)
4. **Visual coherence**: Heritage determines color family, cultures get variations

### Heritage-Culture Relationship

```
Heritage "Mediterranean"
├── Culture "Roman"
├── Culture "Greek"
├── Culture "Phoenician"
└── Culture "Egyptian"
```

Each culture belongs to exactly one heritage. Heritages are assigned through spatial clustering—nearby cultures tend to share heritage.

**Design justification**: This mirrors real history where neighboring peoples often share deep ancestry (Indo-European languages, Bantu peoples, etc.) while maintaining distinct cultural identities.

## Faiths & Religions

### Faiths

Faiths represent specific belief systems practiced by cultures. Each culture belongs to exactly one faith.

**Generation parameters:**
- Density: ~1 faith per 3 cultures
- Spread: Through cultural territories
- Assignment: Each culture adopts one faith

### Faith Purpose

Faiths create another axis of identity and conflict:

1. **Cross-cultural bonds**: Different cultures may share faith
2. **Conflict driver**: Religious differences justify wars (TODO)
3. **Conversion potential**: Faiths can spread independently of culture (TODO)
4. **Narrative richness**: Religious events, reformations, schisms (TODO)

### Religions

Religions are meta-groupings of faiths, similar to how heritages group cultures.

**Generation parameters:**
- Density: ~1 religion per 8 faiths
- Grouping: Spatial proximity
- Color coding: Maximizes visual distinction from neighbors

### Religion-Faith Relationship

```
Religion "Abrahamic"
├── Faith "Judaism"
├── Faith "Christianity"
│   ├── (could have sub-denominations in future)
└── Faith "Islam"
```

**Design justification**: The religion/faith distinction enables modeling both broad religious families and specific denominations. A Christian nation and Muslim nation belong to different faiths but the same religious family—this could create different diplomatic modifiers than truly alien religions.

### Color Assignment Algorithm

Colors are assigned to maximize visual distinction:

1. **Religions**: Assigned hues that maximize distance from neighboring religions
2. **Faiths**: Assigned hues within ±20° of parent religion's hue
3. **Distance metric**: Circular distance on color wheel

```
circular_distance(hue1, hue2) = min(|hue1 - hue2|, 360 - |hue1 - hue2|)
```

This ensures that:
- Neighboring religions are visually distinct
- Related faiths are visually similar
- The map remains readable at both religion and faith zoom levels

## Cultural Layer Interactions

The cultural systems form a hierarchy:

```
Province
├── Culture (1:1)
│   ├── Heritage (many cultures : 1 heritage)
│   └── Faith (many cultures : 1 faith)
│       └── Religion (many faiths : 1 religion)
```

### Current Implementation

Currently, cultural layers are purely descriptive—they provide identity and visual differentiation but don't mechanically affect the simulation.

### Intended Design

Cultural systems should eventually drive:

1. **Unrest**: Ruling foreign cultures increases rebellion risk
2. **Assimilation**: Cultures slowly spread to neighboring provinces under same rule
3. **Conversion**: Faiths spread through missionary activity and state religion
4. **Diplomatic modifiers**: Same culture/heritage/faith improves relations
5. **Casus belli**: "Liberate our people" or "Holy war" war justifications

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Cultural unrest**: Provinces with different culture than ruler have increased rebellion probability. Scales with cultural distance (same heritage = mild, different heritage = severe).

- [ ] **State religion**: Nations adopt official faiths. Ruling different-faith provinces causes unrest. Enables religious persecution or tolerance policies.

- [ ] **Cultural assimilation**: Over long periods of stable rule, province culture drifts toward ruler's culture. Rate modified by policies and cultural distance.

- [ ] **Diplomatic modifiers**: Implement culture/heritage/faith modifiers to relation calculations. Same culture = +friendly, same heritage = +neutral, same faith = +friendly, same religion = neutral.

### Medium Priority

- [ ] **Missionaries and conversion**: Faith spreads independently of political control. Missionary events convert provinces. Conversion rate based on ruler's faith, neighboring faiths, and province development.

- [ ] **Religious reformation**: Major faiths can schism into daughter faiths. Triggers religious wars and realignment.

- [ ] **Cultural drift**: Cultures slowly diverge over time when separated by political boundaries. Long-separated provinces of same culture eventually become distinct cultures.

- [ ] **Language families**: Add linguistic layer parallel to heritage. Languages affect communication and administration.

- [ ] **Cultural golden ages**: Cultures can experience periods of flourishing that spread influence and provide bonuses.

### Low Priority

- [ ] **Syncretism**: New faiths emerging from combination of existing faiths in border regions.

- [ ] **Heresy**: Minor faith variants that can grow into full schisms.

- [ ] **Cultural wonders**: Great works (libraries, temples, monuments) that boost cultural prestige.

- [ ] **Nomadic cultures**: Cultures that don't attach to fixed provinces but move across the map.

- [ ] **Cultural technologies**: Innovations that spread along cultural/heritage lines.

### Technical Debt

- [ ] **Culture/faith change tracking**: Record when provinces change culture or faith for historical queries.

- [ ] **Cultural influence mapping**: Visualize which cultures are expanding vs contracting over time.

- [ ] **Efficient cultural distance**: Pre-compute and cache cultural/heritage/faith distances for performance.

### Design Questions

- Should cultures be able to go extinct? Currently they persist forever once created.
- Should new cultures be able to emerge during simulation? (Colonial cultures, creole cultures)
- How should cultural systems interact with the subject/overlord hierarchy? (Imperial cultures, client cultures)
