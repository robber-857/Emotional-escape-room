"""Server copy of the versioned L2 prototype geometry; never a scoring policy."""
from copy import deepcopy
from math import isfinite

VERSION = "l2-placement-v7"
FURNITURE = {"armchair": (285, 990, .19, .20), "chair": (1145, 810, .085, .13),
             "sofa": (1510, 925, .31, .23), "table-chair": (1510, 1013, .41, .10)}

def initial_layout():
    return {key: dict(u=.5+(x-960)/(1100+820*((y-760)/270)), v=(y-760)/270)
            for key, (x, y, _, _) in FURNITURE.items()}

def footprint(key, p):
    _, _, w, d = FURNITURE[key]
    return dict(left=p["u"]-w/2, right=p["u"]+w/2, top=p["v"]-d/2, bottom=p["v"]+d/2)

def overlap_footprint(key, p):
    # All furniture uses its full floor footprint, including the table/chair unit.
    return footprint(key, p)

def area(r): return (r["right"]-r["left"])*(r["bottom"]-r["top"])
def intersection(a, b):
    return max(0, min(a["right"], b["right"])-max(a["left"], b["left"]))*max(0, min(a["bottom"], b["bottom"])-max(a["top"], b["top"]))
def left_floor_edge(v):
    return max(-.12*max(0, min(1, (v-.10)/.45)), .5+(35-960)/(1100+820*max(0,v)))

SUSPENSION_TOLERANCE_CM = 1.4
SUSPENSION_TOLERANCE_PX = SUSPENSION_TOLERANCE_CM*96/2.54

def suspension_gap_px(b): return max(0, -b["top"]*270)

# Soft contact-area margin, not the full sprite (backs/shadows overhang).
SIDE_MARGIN = .02
FRONT_MARGIN = .04
REAR_CONTACT_EDGE = .12

def constrain_point(key, point):
    _, _, w, d = FURNITURE[key]
    v = max(d/2+REAR_CONTACT_EDGE, min(1+FRONT_MARGIN-d/2, point['v']))
    left = max(left_floor_edge(v-d/2),left_floor_edge(v+d/2))-SIDE_MARGIN+w/2
    return dict(u=max(left,min(1+SIDE_MARGIN-w/2,point['u'])),v=v)

def constrain_layout(layout):
    return {key:constrain_point(key,layout[key]) for key in FURNITURE}

def inside(b):
    return b["top"] >= REAR_CONTACT_EDGE-1e-9 and b["bottom"] <= 1+FRONT_MARGIN+1e-9 and b["right"] <= 1+SIDE_MARGIN+1e-9 and b["left"] >= max(left_floor_edge(b["top"]), left_floor_edge(b["bottom"]))-SIDE_MARGIN-1e-9
def valid_layout(layout):
    if any(k not in layout or any(not isfinite(layout[k][axis]) for axis in ("u", "v")) for k in FURNITURE): return False
    boxes = [footprint(k, layout[k]) for k in FURNITURE]
    overlap_boxes = [overlap_footprint(k, layout[k]) for k in FURNITURE]
    return all(inside(b) for b in boxes) and all(intersection(b, c)/min(area(b), area(c)) <= .20+1e-9 for i, b in enumerate(overlap_boxes) for c in overlap_boxes[i+1:])

def move_layout(layout, key, point):
    if key not in FURNITURE or any(not isfinite(point[a]) or not -4 <= point[a] <= 4 for a in ("u", "v")):
        raise ValueError("INVALID_PLACEMENT")
    result = deepcopy(layout)
    result[key] = constrain_point(key,point)
    return result
