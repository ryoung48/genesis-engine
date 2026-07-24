"""Curated organization membership used by build-eu4-history-events.py.

These rows model historical organization membership directly when the source
data's ordinary diplomacy/alliance records are too weak a proxy. Dates use the
same EU4-style Y.M.D strings consumed by eu4_date_to_days.
"""

from __future__ import annotations

from typing import NamedTuple


class OrganizationMembership(NamedTuple):
    org_id: str
    nation_tag: str
    join_date: str
    leave_date: str | None
    # Sub-category within the org, folded onto FoldedNationState.organizations
    # and consumed directly by organization-categories.ts's categorizer for
    # orgs that have more than one member type (e.g. GG's leader/member split
    # per faction). Orgs with a single undistinguished member type (HSA) leave
    # this at the default "member".
    role: str = "member"


class OrganizationSite(NamedTuple):
    org_id: str
    province_id: str
    name: str
    role: str
    start_date: str
    end_date: str | None


# Sources used for the HSA curation below:
# - Die Hanse, "Trading posts":
#   https://www.hanse.org/en/the-medieval-hanseatic-league/die-kontore
#   Names the four major kontors as Novgorod, London, Bruges, and Bergen, and
#   describes these as large trading posts abroad rather than Hanseatic member
#   cities.
# - Die Hanse, "Hanseatic City of Visby":
#   https://www.hanse.org/en/discover-the-hanseatic-cities/hanseatic-city-of-visby
#   Describes Visby's leading Hanseatic role until the mid-14th century.
# - UNESCO World Heritage Centre, "Hanseatic Town of Visby":
#   https://whc.unesco.org/en/list/731/
#   Describes Visby as the Baltic center of the Hanseatic League from the 12th
#   to 14th century and notes its decline after plague, Danish conquest, and
#   changed routes.
# - Encyclopaedia Britannica, "Hanseatic League":
#   https://www.britannica.com/topic/Hanseatic-League
#   General reference for the league as an association of north German towns.
# - Supplemental date checks from the Hanseatic League overview:
#   https://en.wikipedia.org/wiki/Hanseatic_League
#   Used only where the primary pages summarize the institution but not the
#   event date: 1356 institutionalization, Novgorod closure in 1494, Bruges
#   shift to Antwerp in 1520, Antwerp closure in 1593, London expulsion in
#   1598, Bergen sale/continuation until 1754, the last formal Hanseatic
#   meeting in 1669, and the secondary cross-check list of Hansa Proper member
#   cities.
# - Province ids for trade branches were resolved by sampling
#   public/heightmap/eu4-provinces.bin.gz at modern city coordinates and
#   cross-checking those hits against public/earth-history/events/provinces.json
#   names. This is a coordinate-to-EU4-province mapping method, not a historical
#   source by itself.
#
# The Hansa was a loose city league rather than a normal country-to-country
# alliance. Keep this intentionally conservative and tied to tags that exist in
# public/earth-history/reference/nations.json.
# Sources used for the Guelphs and Ghibellines (GG) curation below. There is
# no EU4 source data or geo-explorer diplomacy proxy for this rivalry at all
# -- unlike HSA above, every row here is a synthesized approximation from
# general historical references, not a game-data conversion. Treat the exact
# dates as illustrative, not precise:
# - Encyclopaedia Britannica, "Guelf and Ghibelline":
#   https://www.britannica.com/topic/Guelf-and-Ghibelline
#   General reference for the papal (Guelph) vs. imperial (Ghibelline)
#   factional split among northern/central Italian city-states, its
#   traditional origin around 1216 in Florence, and its persistence as local
#   city-state rivalries through the mid-15th century.
# - Wikipedia, "Guelphs and Ghibellines":
#   https://en.wikipedia.org/wiki/Guelphs_and_Ghibellines
#   Names Florence as the leading Guelph city and the Papacy as the Guelph
#   faction's namesake patron; Milan as the leading Ghibelline city after the
#   Visconti's 1277 takeover; Verona under the della Scala (Scaliger) family
#   and Siena (Guelph Florence's rival at the 1260 Battle of Montaperti) as
#   Ghibelline; Bologna as a long-standing Guelph League member from 1274;
#   and the 1454 Peace of Lodi as the conventional end point for overt
#   Guelph/Ghibelline city-state warfare in Italy.
# - Wikipedia, "Pisa": https://en.wikipedia.org/wiki/Pisa
#   Notes Pisa's Ghibelline alignment as a rival of Guelph Florence through
#   the 13th-14th centuries.
# - Wikipedia, "Republic of Lucca": https://en.wikipedia.org/wiki/Republic_of_Lucca
#   Notes Lucca's Guelph alignment after regaining independence from Pisa in
#   1369 (its earlier 1314-1328 Ghibelline interlude under Castruccio
#   Castracani is excluded here to keep this conservative).
# - Wikipedia, "Visconti of Milan":
#   https://en.wikipedia.org/wiki/Visconti_of_Milan
#   Milan itself switched sides: under the della Torre family (Guelph,
#   installed as Lords of Milan in 1259) until Archbishop Ottone Visconti's
#   Ghibelline faction defeated them at the Battle of Desio in 1277 and took
#   over the city, after which the Visconti led the Ghibelline cause.
# - Wikipedia, "Republic of Genoa":
#   https://en.wikipedia.org/wiki/Republic_of_Genoa
#   Genoa's internal Ghibelline (Doria/Spinola) and Guelph (Fieschi/Grimaldi)
#   factions traded control repeatedly; the Ghibelline Doria/Spinola era
#   (from c. 1270) ended when the popular Guelph-aligned faction elected
#   Simone Boccanegra as Genoa's first doge in 1339.
# - Wikipedia, "Bologna": https://en.wikipedia.org/wiki/Bologna and
#   "Romeo Pepoli": https://en.wikipedia.org/wiki/Romeo_Pepoli
#   Bologna's Guelph League membership was interrupted 1306-1321 by internal
#   strife (the Pepoli-led Ghibelline-leaning interlude and a papal
#   interdict) before it rejoined the Guelph camp.
# - Paradox Interactive Forums, "Tinto Talks #69" (25 June 2025), covering
#   Europa Universalis V's own Guelphs & Ghibellines situation:
#   https://forum.paradoxplaza.com/forum/developer-diary/tinto-talks-69-25th-of-june-2025.1780936/
#   Not a historical source (it's another Paradox game's design), and its
#   snapshot is for EU5's own 1337 start date -- a full century before EU4's
#   1444 start, not evidence about who led each faction that late. Still a
#   useful cross-check for which city anchored each faction leadership over
#   the org's broader span: EU5 designates Naples as the Guelph faction
#   leader and Milan as the Ghibelline leader as of 1337, which is why NAP
#   (not Florence) is modeled as guelphLeader below for the org's whole
#   1216-1454 span -- unlike Milan, Naples has no documented leadership flip,
#   so treating it as a stable Guelph anchor throughout is a reasonable
#   simplification even though this specific 1337 snapshot doesn't by itself
#   prove that held true near 1444. Florence has the older Guelph pedigree
#   but is modeled as guelphMember rather than co-leader. It also lists the
#   Papal States (alongside Naples/Sicily) as
#   exempt from being forced into the HRE under a Ghibelline win, consistent
#   with treating the Papacy as Guelph-aligned rather than Ghibelline here.
#
# - User-compiled research digest (cross-checking Treccani's Enciclopedia
#   Italiana/Dantesca entries, the Catholic Encyclopedia, and Wikipedia),
#   covering the wider cast of Guelph/Ghibelline cities and leaders beyond
#   the handful above. Used for:
#   - Perugia: fought as part of the Guelph coalition (with Florence, Lucca,
#     Orvieto) defeated at Montaperti in 1260; lost communal independence to
#     direct Papal control after Cardinal Albornoz's mid-14th-century
#     reconquest of the Papal States (~1370, per Wikipedia "Perugia").
#   - Ferrara/Modena: the Este expelled the Ghibelline Salinguerra Torelli
#     from Ferrara and were installed as papal vicars there in 1264, later
#     acquiring Modena in 1288 (dates per Wikipedia "House of Este");
#     Guelph-aligned continuously afterward.
#   - Mantua: held by the Bonacolsi (from 1273) and then, after the 1328
#     coup, the Gonzaga -- both dynasties ruled as *imperial* vicars, which
#     is why Mantua is modeled as Ghibelline throughout despite the ruling
#     family changing (Wikipedia "Bonacolsi", "Gonzaga").
#   - Urbino: seat of the Montefeltro, one of the digest's explicitly named
#     Ghibelline dynasties (Guido da Montefeltro and successors held the
#     imperial vicariate from the 1230s; Wikipedia "House of Montefeltro").
#   - Parma: joined the anti-imperial (Guelph) side after its 1247 revolt
#     against Frederick II.
#
# The HRE Emperor is deliberately NOT curated here as a per-tag membership
# row, unlike the rows above -- the Imperial crown rotated between dynasties
# (Luxembourg, Wittelsbach, Habsburg, ...) across the org's 200+ year span, so
# a fixed tag would misrepresent whoever happens to hold the title at a given
# moment. Instead organization-categories.ts' createGuelphGhibellineCategorizer
# derives "ghibellineLeader" dynamically from FoldedNationState.isEmperor,
# which already tracks the current Emperor correctly over time (see HRE's own
# emperorStart/emperorEnd events in diplomacy.json).
#
# EU4 tags (per public/earth-history/reference/nations.json): Naples=NAP,
# Florence=LAN, Papal States=PAP, Milan=MLO, Verona=VRN, Siena=SIE,
# Bologna=BLG, Pisa=PIS, Lucca=LUC, Genoa=GEN, Perugia=PGA, Ferrara=FER,
# Modena=MOD, Mantua=MAN, Urbino=URB, Parma=PAR. Roles match
# organization-categories.ts' GG_CATEGORIES ids exactly.
GUELPH_GHIBELLINE_MEMBERSHIPS: tuple[OrganizationMembership, ...] = (
    # Naples as Guelph leader follows EU5's Tinto Talks #69 designation (see
    # sources above) rather than Florence, which is the more commonly cited
    # Guelph city historically but was the smaller power by 1444.
    OrganizationMembership(
        "GG", "NAP", "1216.1.1", "1454.4.9", role="guelphLeader"
    ),
    OrganizationMembership(
        "GG", "LAN", "1216.1.1", "1454.4.9", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "PAP", "1216.1.1", "1454.4.9", role="guelphMember"
    ),
    # Bologna's Guelph League membership, interrupted 1306-1321 by internal
    # Ghibelline-leaning strife -- an example of a member bowing out and
    # later rejoining rather than staying continuously enrolled.
    OrganizationMembership(
        "GG", "BLG", "1274.1.1", "1306.1.1", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "BLG", "1321.1.1", "1454.4.9", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "LUC", "1369.1.1", "1454.4.9", role="guelphMember"
    ),
    # Milan switched sides: Guelph under the della Torre (from 1259) until
    # the Visconti's Ghibelline takeover at the 1277 Battle of Desio, after
    # which Milan led the Ghibelline cause for the rest of the org's span.
    OrganizationMembership(
        "GG", "MLO", "1259.1.1", "1277.1.22", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "MLO", "1277.1.22", "1454.4.9", role="ghibellineLeader"
    ),
    OrganizationMembership(
        "GG", "VRN", "1259.1.1", "1387.1.1", role="ghibellineMember"
    ),
    OrganizationMembership(
        "GG", "SIE", "1260.9.4", "1454.4.9", role="ghibellineMember"
    ),
    OrganizationMembership(
        "GG", "PIS", "1228.1.1", "1406.1.1", role="ghibellineMember"
    ),
    # Genoa flipped from Ghibelline (Doria/Spinola) to Guelph-aligned control
    # when Simone Boccanegra was elected Genoa's first doge in 1339.
    OrganizationMembership(
        "GG", "GEN", "1270.1.1", "1339.9.23", role="ghibellineMember"
    ),
    OrganizationMembership(
        "GG", "GEN", "1339.9.23", "1396.1.1", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "PGA", "1216.1.1", "1370.1.1", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "FER", "1264.1.1", "1454.4.9", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "MOD", "1288.1.1", "1454.4.9", role="guelphMember"
    ),
    OrganizationMembership(
        "GG", "MAN", "1273.1.1", "1454.4.9", role="ghibellineMember"
    ),
    OrganizationMembership(
        "GG", "URB", "1234.1.1", "1454.4.9", role="ghibellineMember"
    ),
    OrganizationMembership(
        "GG", "PAR", "1247.6.16", "1454.4.9", role="guelphMember"
    ),
)


GREEK_LEAGUE_MEMBERSHIPS: tuple[OrganizationMembership, ...] = (
    # Greek leagues are modeled as international organizations rather than
    # countries. The member tags below are polis/regional owner tags from the
    # ancient audit split; membership must not transfer province ownership to
    # Athens, Sparta, or any other hegemon.
    OrganizationMembership("GPL", "cp_sparta", "-549.1.1", "-337.1.1", role="leader"),
    OrganizationMembership("GPL", "cp_corinth", "-549.1.1", "-337.1.1"),
    OrganizationMembership("GPL", "cp_achaea", "-549.1.1", "-337.1.1"),
    OrganizationMembership("GPL", "cp_ionian_islands", "-549.1.1", "-337.1.1"),
    OrganizationMembership("DAL", "cp_athens", "-477.1.1", "-403.1.1", role="leader"),
    OrganizationMembership("DAL", "cp_euboea", "-477.1.1", "-403.1.1"),
    OrganizationMembership("DAL", "cp_lesbos", "-477.1.1", "-403.1.1"),
    OrganizationMembership("DAL", "cp_naxos", "-477.1.1", "-403.1.1"),
    OrganizationMembership("DAL", "cp_smyrna", "-477.1.1", "-403.1.1"),
    OrganizationMembership("DAL", "cp_anatolian_greek_city_states", "-477.1.1", "-403.1.1"),
    OrganizationMembership("SAL", "cp_athens", "-377.1.1", "-354.1.1", role="leader"),
    OrganizationMembership("SAL", "cp_euboea", "-377.1.1", "-354.1.1"),
    OrganizationMembership("SAL", "cp_lesbos", "-377.1.1", "-354.1.1"),
    OrganizationMembership("SAL", "cp_naxos", "-377.1.1", "-354.1.1"),
    OrganizationMembership("SAL", "cp_smyrna", "-377.1.1", "-354.1.1"),
    OrganizationMembership("ACL", "cp_achaea", "-279.1.1", "-145.1.1", role="leader"),
    OrganizationMembership("ACL", "cp_corinth", "-242.1.1", "-145.1.1"),
    OrganizationMembership("ACL", "cp_sparta", "-191.1.1", "-145.1.1"),
    OrganizationMembership("AEL", "cp_aetolia", "-369.1.1", "-188.1.1", role="leader"),
    OrganizationMembership("AEL", "cp_epirus_city_states", "-369.1.1", "-188.1.1"),
    OrganizationMembership("AEL", "cp_thessalian_city_states", "-369.1.1", "-188.1.1"),
    OrganizationMembership("LCO", "cp_macedonian_empire", "-337.1.1", "-321.1.1", role="leader"),
    OrganizationMembership("LCO", "cp_athens", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_corinth", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_achaea", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_aetolia", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_thessalian_city_states", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_chalcidice_city_states", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_macedonian_greek_city_states", "-337.1.1", "-321.1.1"),
    OrganizationMembership("LCO", "cp_thracian_greek_city_states", "-337.1.1", "-321.1.1"),
)


CURATED_ORGANIZATION_MEMBERSHIPS: tuple[OrganizationMembership, ...] = (
    OrganizationMembership("HSA", "HSA", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "HAM", "1356.1.1", "1669.1.1"),
    # Bremen is split because geo-explorer's diplomacy source explicitly
    # models its Hansa trade-league relation as 1380-1563, then 1576 onward
    # after a short expulsion over religious conflicts.
    OrganizationMembership("HSA", "BRE", "1380.1.1", "1563.1.1"),
    OrganizationMembership("HSA", "BRE", "1576.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "KOL", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "BRU", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "MAG", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "LUN", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "RIG", "1356.1.1", "1581.1.1"),
    OrganizationMembership("HSA", "DNZ", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "GOT", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "MUN", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "OLD", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "EFR", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "UTR", "1356.1.1", "1669.1.1"),
    OrganizationMembership("HSA", "GEL", "1356.1.1", "1669.1.1"),
    *GREEK_LEAGUE_MEMBERSHIPS,
    *GUELPH_GHIBELLINE_MEMBERSHIPS,
)


# Foreign offices/trading posts are province-level sites, not members. HSA
# membership itself is still modeled by the nation-tag rows above, so the map
# follows each member country's currently-owned provinces. The province ids are
# raw EU4 ids from public/earth-history/events/provinces.json:
# 310 Novgorod, 236 London, 90 Vlaanderen/Brugge, 23 Bergenshus/Bergen,
# 1744 Antwerpen. Smaller branches/factories use role=trade_branch.
# A small number of member_seat rows can pin a named member's civic seat where
# country-level ownership otherwise hides the city entirely; Danzig is the
# known case that needs this. Trade-branch rows below are intentionally lower
# confidence than the four major kontors; they model attested/secondary
# Hanseatic associated branches or trading cities that improve map coverage,
# not full kontor status.
CURATED_ORGANIZATION_SITES: tuple[OrganizationSite, ...] = (
    OrganizationSite("HSA", "43", "Danzig", "member_seat", "1356.1.1", "1669.1.1"),
    OrganizationSite("HSA", "310", "Peterhof", "kontor", "1356.1.1", "1494.1.1"),
    OrganizationSite("HSA", "236", "Steelyard", "kontor", "1356.1.1", "1598.1.13"),
    OrganizationSite(
        "HSA",
        "90",
        "Bruges Kontor",
        "kontor",
        "1356.1.1",
        "1520.1.1",
    ),
    OrganizationSite("HSA", "23", "Bryggen", "kontor", "1356.1.1", "1754.1.1"),
    OrganizationSite(
        "HSA",
        "1744",
        "Antwerp Kontor",
        "kontor",
        "1520.1.1",
        "1593.1.1",
    ),
    OrganizationSite(
        "HSA",
        "40",
        "Memel Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "1859",
        "Thorn Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "1858",
        "Stettin Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "1834",
        "Dorpat Branch",
        "trade_branch",
        "1356.1.1",
        "1558.1.1",
    ),
    OrganizationSite(
        "HSA",
        "36",
        "Reval Branch",
        "trade_branch",
        "1356.1.1",
        "1558.1.1",
    ),
    OrganizationSite(
        "HSA",
        "1841",
        "Elbing Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "2996",
        "Wismar Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "47",
        "Greifswald Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "4382",
        "Groningen Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "2975",
        "Zutphen Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "1936",
        "Kaunas Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
    OrganizationSite(
        "HSA",
        "99",
        "IJssel Towns Branch",
        "trade_branch",
        "1356.1.1",
        "1669.1.1",
    ),
)
