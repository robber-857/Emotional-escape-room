"""Per-object reachable-distance normalization in fixed ground coordinates."""
from functools import lru_cache
from .l2_layout import FURNITURE, footprint, left_floor_edge, REAR_CONTACT_EDGE, FRONT_MARGIN

METHOD = 'reachable-nearest-wall-v2'
CONTACT_TOLERANCE = .02


def nearest_wall_distance(box):
    left=max(left_floor_edge(box['top']),left_floor_edge(box['bottom']))
    return max(0.,min(box['top']-REAR_CONTACT_EDGE,box['left']-left,1-box['right']))


@lru_cache(maxsize=4)
def calibration(key):
    _,_,width,depth=FURNITURE[key]
    low=REAR_CONTACT_EDGE+depth/2
    high=1+FRONT_MARGIN-depth/2
    def best_at(v):
        left=max(left_floor_edge(v-depth/2),left_floor_edge(v+depth/2))
        point=dict(u=(left+1)/2,v=v)
        return nearest_wall_distance(footprint(key,point)),point
    # For fixed depth, the best horizontal position bisects the wall gap.
    # Along depth, rear clearance increases and side clearance is unimodal.
    for _ in range(80):
        a=low+(high-low)/3;b=high-(high-low)/3
        if best_at(a)[0]<best_at(b)[0]:low=a
        else:high=b
    distance,point=best_at((low+high)/2)
    if distance<=CONTACT_TOLERANCE:raise ValueError('NO_PROXIMITY_RANGE')
    return distance,point


def describe(key,box):
    distance=nearest_wall_distance(box)
    maximum,_=calibration(key)
    value=1-max(0.,min(1.,(distance-CONTACT_TOLERANCE)/(maximum-CONTACT_TOLERANCE)))
    return dict(distance=distance,maxDistance=maximum,contactTolerance=CONTACT_TOLERANCE,proximity=value)
