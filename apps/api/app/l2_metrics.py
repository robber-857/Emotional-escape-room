"""L2-04 overlap groups and proximity evidence; no inferred personality labels."""
from itertools import combinations
from .l2_layout import FURNITURE, footprint, overlap_footprint, area, intersection, inside
from .l2_proximity import describe, METHOD

METRIC_VERSION = "l2-metrics-full-footprint-v4"
MOVEMENT_TOLERANCE = .002
COUNT_VERSION = "l2-adjustments-v1"


def overlap_groups(cores):
    # Positive common area, not graph connectivity or sprite occlusion.
    groups = {}
    for size in (2, 3, 4):
        groups[size] = [list(ids) for ids in combinations(cores, size)
                        if min(cores[k]['right'] for k in ids)-max(cores[k]['left'] for k in ids) > 1e-9
                        and min(cores[k]['bottom'] for k in ids)-max(cores[k]['top'] for k in ids) > 1e-9]
    band = 1 if groups[3] or groups[4] else 2 if len(groups[2]) > 1 else 3 if groups[2] else 4
    return dict(pairs=groups[2], triples=groups[3], quadruples=groups[4], band=band)


def measure(layout, adjustment_count):
    boxes = {k: footprint(k, layout[k]) for k in FURNITURE}
    cores = {k: overlap_footprint(k, layout[k]) for k in FURNITURE}
    pairs = [dict(ids=[a, b], ratio=intersection(cores[a], cores[b])/min(area(cores[a]), area(cores[b])))
             for i, a in enumerate(FURNITURE) for b in list(FURNITURE)[i+1:]]
    per_object = {k: max(p["ratio"] for p in pairs if k in p["ids"]) for k in FURNITURE}
    groups = overlap_groups(cores)
    # Existing floor coordinates: back/left/right wall boundaries. Windows sit on
    # those walls; no extra window bonus or uncalibrated image-space distances.
    proximity = {k:describe(k,b) for k,b in boxes.items()}
    distances = {k:p['distance'] for k,p in proximity.items()}
    outside = [k for k, b in boxes.items() if not inside(b)]
    # tidiness remains a raw diagnostic for compatibility, never the v3 band input.
    return dict(ruleVersion=METRIC_VERSION, countVersion=COUNT_VERSION,
                metrics=dict(wallWindowProximity=sum(p['proximity'] for p in proximity.values())/len(boxes),
                             tidiness=1-sum(per_object.values())/len(boxes), tidinessBand=groups['band'], adjustmentCount=adjustment_count),
                evidence=dict(overlapPairs=pairs, maxOverlapByObject=per_object, wallDistances=distances,
                              overlapCores=cores, overlapGroups=groups, objectCount=len(boxes), outsideFloor=outside,
                              proximityMethod=METHOD,wallProximityByObject=proximity),
                eligible=not outside and adjustment_count is not None,
                reasons=(["OUTSIDE_FLOOR"] if outside else [])+(["LEGACY_ADJUSTMENT_HISTORY_MISSING"] if adjustment_count is None else []))
