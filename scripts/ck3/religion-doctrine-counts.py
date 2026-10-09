# Usage: python scripts/ck3/religion-doctrine-counts.py "<CK3>/game/common/religion"
# Prints the count tables cited by plans/religion-doctrines.md.
import glob
import os
import re
import sys
from collections import Counter, defaultdict

root = sys.argv[1]


def tokens(text):
    text = re.sub(r"#[^\n]*", "", text)
    return re.findall(r'"[^"]*"|[{}=]|[^\s{}=]+', text)


def parse(toks, i=0):
    items = []
    while i < len(toks):
        t = toks[i]
        if t == "}":
            return items, i + 1
        if i + 1 < len(toks) and toks[i + 1] == "=":
            if toks[i + 2] == "{":
                val, i = parse(toks, i + 3)
                items.append((t, val))
            else:
                items.append((t, toks[i + 2]))
                i += 3
        elif t == "{":
            val, i = parse(toks, i + 1)
            items.append((None, val))
        else:
            items.append((None, t))
            i += 1
    return items, i


def load(path):
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return parse(tokens(f.read()))[0]


def files(folder):
    return sorted(glob.glob(os.path.join(root, folder, "*.txt")))


def get(items, key):
    return [v for k, v in items if k == key]


def bare(items, key):
    return [v for blk in get(items, key) for k, v in blk if k is None and isinstance(v, str)]


category = {}
for path in files("doctrine_group_types"):
    for g, body in load(path):
        if isinstance(body, list):
            c = get(body, "category")
            category[g] = c[0] if c else "?"

group_of = {}
options = defaultdict(list)
for path in files("doctrine_types"):
    for d, body in load(path):
        if not isinstance(body, list):
            continue
        g = get(body, "doctrine_group_type")
        if not g:
            continue
        idx = get(body, "index")
        group_of[d] = g[0]
        options[g[0]].append((int(idx[0]) if idx else 99, d))
for g in options:
    options[g] = [d for _, d in sorted(options[g])]

DUAL = {"dualism_religion", "zoroastrianism_religion"}
NONTHEIST = {"buddhism_religion", "jainism_religion", "taoism_religion", "confucianism_religion"}

religions = {}
for path in files("religion_types"):
    for rname, body in load(path):
        if not isinstance(body, list):
            continue
        det = get(body, "religion_details")
        fam = get(det[0], "family") if det else get(body, "family")
        docs = [d for d in get(body, "doctrine") if isinstance(d, str)]
        vec = {}
        for d in docs:
            if d in group_of:
                vec[group_of[d]] = d
        tr = get(body, "traits")
        virtues = [k for k, v in get(tr[0], "virtues")[0]] if tr and get(tr[0], "virtues") else []
        sins = [k for k, v in get(tr[0], "sins")[0]] if tr and get(tr[0], "sins") else []
        unre = any("unreformed" in d for d in docs) or bool(get(body, "pagan_roots"))
        theism = vec.get("doctrine_theism", "?").replace("doctrine_", "")
        if rname in DUAL:
            typ = "dualistic"
        elif rname in NONTHEIST:
            typ = "nontheistic"
        elif theism == "monotheist":
            typ = "monotheistic"
        elif unre:
            typ = "animistic"
        else:
            typ = "polytheistic"
        religions[rname] = dict(
            family=fam[0] if fam else "?", vec=vec, virtues=virtues, sins=sins, unre=unre, theism=theism, type=typ, faiths=[]
        )

rites = {}
for path in files("rite_types"):
    for rn, rb in load(path):
        if isinstance(rb, list):
            rites[rn] = bare(rb, "doctrines")

for path in files("faith_types"):
    for fname, body in load(path):
        if not isinstance(body, list):
            continue
        det = get(body, "faith_details")
        rname = get(det[0], "religion")[0] if det else get(body, "religion")[0]
        own = bare(body, "doctrines")
        mr = get(body, "main_rite")
        if mr:
            own = own + rites.get(mr[0], [])
        vec = dict(religions[rname]["vec"])
        over = set()
        for d in own:
            if d in group_of:
                g = group_of[d]
                if vec.get(g) != d:
                    over.add(g)
                vec[g] = d
        religions[rname]["faiths"].append(dict(name=fname, vec=vec, over=over))

TYPES = ["animistic", "polytheistic", "dualistic", "monotheistic", "nontheistic"]

import itertools

PLAN = ["marriage_type","divorce","bastardry","consanguinity","homosexuality","adultery","witchcraft","kinslaying",
 "gender","pluralism","theocracy","head_of_faith","pilgrimage","funeral","monasticism_group"]
OPTION_ORDER = {
    "adultery": ["crime", "shunned", "accepted"],
    "witchcraft": ["crime", "shunned", "accepted"],
    "homosexuality": ["crime", "shunned", "accepted"],
    "consanguinity": ["restricted", "cousins", "aunt_nephew_and_uncle_niece", "unrestricted"],
    "kinslaying": ["extended_family_crime", "close_kin_crime", "shunned", "accepted"],
}
RENAME = {
    "doctrine_kinslaying_any_dynasty_member_crime": "extended_family_crime",
    "doctrine_witchcraft_virtuous": "accepted",
    "doctrine_consanguinity_dynastic": "restricted",
    "doctrine_pilgrimage_mandatory_hajj": "mandatory",
}

HEAD = {"no_head": "none", "spiritual_head": "spiritual", "temporal_head": "temporal"}

def short(g, d):
    if d in RENAME: return RENAME[d]
    if g == "adultery": d = d.replace("adultery_men_", "adultery_").replace("adultery_women_", "adultery_")
    name = d.replace("doctrine_", "").replace(g.replace("doctrine_", "").replace("_group", "") + "_", "")
    return HEAD.get(name, name) if g == "head_of_faith" else name

def strictest(a, b):
    order = OPTION_ORDER["adultery"]
    return a if order.index(a) <= order.index(b) else b

def plan_vec(vec):
    out = {}
    for g in PLAN:
        if g == "adultery":
            out[g] = strictest(short("adultery", vec["doctrine_adultery_men"]), short("adultery", vec["doctrine_adultery_women"]))
        else:
            raw = vec.get("doctrine_" + g) or vec.get(g)
            out[g] = short(g, raw) if raw else None
    return out

for r in religions.values():
    r["pvec"] = plan_vec(r["vec"])
    for f in r["faiths"]:
        f["pvec"] = plan_vec(f["vec"])
        f["over"] = {g for g in PLAN if f["pvec"][g] != r["pvec"][g]}

def option_names(g):
    seen = []
    for t in TYPES:
        pass
    names = []
    for r in religions.values():
        for f in r["faiths"]:
            if f["pvec"][g] not in names: names.append(f["pvec"][g])
    return OPTION_ORDER.get(g) or names

allf = [(v["type"], f, r) for r, v in religions.items() for f in v["faiths"]]
print("faiths by type", {t: sum(1 for x in allf if x[0]==t) for t in TYPES})
print("adultery men/women differ", sum(1 for t,f,r in allf if short("adultery", f["vec"]["doctrine_adultery_men"]) != short("adultery", f["vec"]["doctrine_adultery_women"])), "of", len(allf))
print("temporal head with temporal theocracy", sum(1 for t,f,r in allf if f["pvec"]["head_of_faith"] == "temporal" and f["pvec"]["theocracy"] == "temporal"))
print("\n| Group | Option | Ani | Poly | Dual | Mono | Non |")
print("|---|---|---|---|---|---|---|")
for g in PLAN:
    for d in option_names(g):
        row = [sum(1 for t2, f, r in allf if t2 == t and f["pvec"][g] == d) for t in TYPES]
        if sum(row) == 0: continue
        print("| %s | %s | %s |" % (g.replace("_group",""), d, " | ".join(map(str,row))))
multi = [f for v in religions.values() if len(v["faiths"]) > 1 for f in v["faiths"]]
print("\nmulti-faith religions", sum(1 for v in religions.values() if len(v["faiths"])>1), "faiths", len(multi))
tot = 0
for g in PLAN:
    n = sum(1 for f in multi if g in f["over"]); tot += n
    print("  %-28s %2d/%d = %.3f" % (g, n, len(multi), n/len(multi)))
print("mean flips per faith over %d groups" % len(PLAN), tot/len(multi))
per = [len(f["over"]) for f in multi]
print("hist", sorted(Counter(per).items()))
print("faiths with a differing head of faith and theocracy together", sum(1 for f in multi if {"head_of_faith", "theocracy"} <= f["over"]))

def ranks(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i]); r = [0.0]*len(xs); i = 0
    while i < len(order):
        j = i
        while j+1 < len(order) and xs[order[j+1]] == xs[order[i]]: j += 1
        for k in range(i, j+1): r[order[k]] = (i+j)/2.0
        i = j+1
    return r
def pear(a, b):
    n = len(a); ma = sum(a)/n; mb = sum(b)/n
    va = sum((x-ma)**2 for x in a); vb = sum((x-mb)**2 for x in b)
    if va == 0 or vb == 0: return None
    return sum((x-ma)*(y-mb) for x, y in zip(a, b))/(va*vb)**0.5
CR = ["adultery", "homosexuality", "witchcraft"]
def val(f, g): return option_names(g).index(f["pvec"][g])
for label, units in (("faith-level", [(t, f) for t, f, r in allf]), ("religion-level", [(v["type"], {"pvec": v["pvec"]}) for v in religions.values()])):
    print("\nSpearman", label)
    for sub in (CR,):
        pooled = []; strat = []
        for a, b in itertools.combinations(sub, 2):
            p = pear(ranks([val(f,a) for t,f in units]), ranks([val(f,b) for t,f in units]))
            pooled.append(p)
            num = 0; den = 0
            for t in TYPES:
                u = [f for t2, f in units if t2 == t]
                if len(u) < 4: continue
                q = pear(ranks([val(f,a) for f in u]), ranks([val(f,b) for f in u]))
                if q is not None: num += q*len(u); den += len(u)
            strat.append(num/den)
        print("  groups=%d pooled mean %.3f  within-type mean %.3f  min %.2f max %.2f" % (len(sub), sum(pooled)/len(pooled), sum(strat)/len(strat), min(strat), max(strat)))

SIM = "brave craven ambitious content wrathful calm just arbitrary diligent lazy generous greedy lustful chaste temperate gluttonous patient impatient humble arrogant honest deceitful gregarious shy zealous cynical trusting paranoid forgiving vengeful compassionate callous sadistic stubborn fickle eccentric".split()
GR = [[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[20,21],[22,23],[24,25],[26,27],[28,29],[30,31,32],[33,34,35]]
gof = {SIM[c]: i for i, g in enumerate(GR) for c in g}
nv = ns = opp = dropv = drops = 0; same_group_virtues = 0
for v in religions.values():
    vs = [t for t in v["virtues"] if t in gof]; ss = [t for t in v["sins"] if t in gof]
    dropv += len(v["virtues"]) - len(vs); drops += len(v["sins"]) - len(ss)
    nv += len(vs); ns += len(ss)
    opp += sum(1 for s in ss if gof[s] in {gof[t] for t in vs})
    if len({gof[t] for t in vs}) < len(vs): same_group_virtues += 1
print("\nvirtues", nv, "dropped non-sim", dropv, "| sins", ns, "dropped", drops, "| sins opposite a virtue", opp, "= %.3f" % (opp/ns), "| religions with two virtues in one group", same_group_virtues)
print("sim-virtue count per religion", sorted(Counter(len([t for t in v["virtues"] if t in gof]) for v in religions.values()).items()))
for kind in ("virtues", "sins"):
    print("\n| %s | Ani | Poly | Dual | Mono | Non |" % kind)
    c = defaultdict(Counter)
    for v in religions.values():
        for t in v[kind]:
            if t in gof: c[t][v["type"]] += 1
    for t in sorted(c, key=lambda t: -sum(c[t].values())):
        print("| %s | %s |" % (t, " | ".join(str(c[t][x]) for x in TYPES)))
    print("totals", [sum(c[t][x] for t in c) for x in TYPES])
