"""Curated historical-city targets where nearest-coordinate matching is wrong."""

HISTORICAL_NAME_OVERRIDES = {
    "Edo": "Tokyo",
    "Tokyo": "Tokyo",
    "Cahokia": "Saint Louis",
    "Chichen Itza": "Playa del Carmen",
    "Machu Picchu": "Quillabamba",
    "Monte Alban": "Santa Cruz Xoxocotlán",
    "Tula": "Tula de Allende",
    "Capua": "Santa Maria Capua Vetere",
    # Ancient Sparta's source point is 36 km from current Sparti, outside the
    # normal 25 km safety radius, but this is the intended historical link.
    "Sparta": "Sparti (agglomeration)",
}

# The extended EU4 timeline duplicates Qaraqorum's 848 rename in two distant
# provinces. Province 4678 is the closer of the two, but GHSL has no actual
# Qaraqorum carrier, so retain its EU4 province-center location without
# borrowing the population of Tsetserleg 108 km away.
PROVINCE_CAPITAL_NAME_EXCLUSIONS = {("2190", "Qaraqorum")}
PROVINCE_GHSL_ENRICHMENT_EXCLUSIONS = {"4678"}
