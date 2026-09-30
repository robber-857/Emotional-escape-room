"""Server copy of the versioned L2 prototype geometry; never a scoring policy."""
from copy import deepcopy
from math import isfinite

VERSION = "l2-placement-v5"
FURNITURE = {"armchair": (285, 990, .19, .20), "chair": (1145, 810, .085, .13),
             "sofa": (1510, 925, .31, .23), "table-chair": (1510, 1013, .41, .10)}

def initial_layout():
    return {key: dict(u=.5+(x-960)/(1100+820*((y-760)/270)), v=(y-760)/270)
            for key, (x, y, _, _) in FURNITURE.items()}

def footprint(key, p):
    _, _, w, d = FURNITURE[key]
    return dict(left=p["u"]-w/2, right=p["u"]+w/2, top=p["v"]-d/2, bottom=p["v"]+d/2)

def overlap_footprint(key, p):
    # Keep full floor contact/clearance; only narrow the table/chair overlap core.
    box = footprint(key, p)
    return dict(box, left=p["u"]-.29/2, right=p["u"]+.29/2) if key == "table-chair" else box

def area(r): return (r["right"]-r["left"])*(r["bottom"]-r["top"])
def intersection(a, b):
    return max(0, min(a["right"], b["right"])-max(a["left"], b["left"]))*max(0, min(a["bottom"], b["bottom"])-max(a["top"], b["top"]))
def left_floor_edge(v):
    return max(-.12*max(0, min(1, (v-.10)/.45)), .5+(35-960)/(1100+820*max(0,v)))

SUSPENSION_TOLERANCE_CM = 1.4
SUSPENSION_TOLERANCE_PX = SUSPENSION_TOLERANCE_CM*96/2.54

def suspension_gap_px(b): return max(0, -b["top"]*270)

def inside(b):
    return suspension_gap_px(b) <= SUSPENSION_TOLERANCE_PX+1e-9 and b["bottom"] <= 1 and b["right"] <= 1 and b["left"] >= max(left_floor_edge(b["top"]), left_floor_edge(b["bottom"]))-1e-9
def valid_layout(layout):
    if any(k not in layout or any(not isfinite(layout[k][axis]) for axis in ("u", "v")) for k in FURNITURE): return False
    boxes = [footprint(k, layout[k]) for k in FURNITURE]
    overlap_boxes = [overlap_footprint(k, layout[k]) for k in FURNITURE]
    return all(inside(b) for b in boxes) and all(intersection(b, c)/min(area(b), area(c)) <= .20+1e-9 for i, b in enumerate(overlap_boxes) for c in overlap_boxes[i+1:])

def move_layout(layout, key, point):
    if key not in FURNITURE or any(not isfinite(point[a]) or not -4 <= point[a] <= 4 for a in ("u", "v")):
        raise ValueError("INVALID_PLACEMENT")
    result = deepcopy(layout)
    result[key] = dict(point)
    return result
