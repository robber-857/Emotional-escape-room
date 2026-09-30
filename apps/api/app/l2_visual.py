"""Positive common area of cropped alpha-mask strips in rendered scene space.

Masks use four-scene-pixel sampling at alpha >= 128. SVG CSS shadows are not
part of the source alpha. Keep generation crops aligned with Scene.tsx.
"""
from .l2_layout import FURNITURE
from pathlib import Path
from itertools import combinations
import json

MASKS = json.loads((Path(__file__).parent/'config/l2-overlap-masks.json').read_text())


def scene_rows(key, point):
    ax, ay, _, _ = FURNITURE[key]
    v = point['v']
    px, py = 960+(point['u']-.5)*(1100+820*max(0, v)), 760+270*v
    scale = (.78+.25*max(0, v))/(.78+.25*((ay-760)/270))
    return [(py+(top-ay)*scale, py+(bottom-ay)*scale,
             [(px+(left-ax)*scale, px+(right-ax)*scale) for left,right in runs])
            for top,bottom,runs in MASKS['pieces'][key]['rows']]


def intersect_rows(a, b):
    result=[]; i=j=0
    while i<len(a) and j<len(b):
        at,ab,ar=a[i]; bt,bb,br=b[j]
        top,bottom=max(at,bt),min(ab,bb)
        if bottom-top>1e-9:
            runs=[(max(al,bl),min(ah,bh)) for al,ah in ar for bl,bh in br
                  if min(ah,bh)-max(al,bl)>1e-9]
            if runs: result.append((top,bottom,runs))
        if ab<=bb: i+=1
        else: j+=1
    return result


def visual_groups(layout):
    rows={k:scene_rows(k,layout[k]) for k in FURNITURE}
    groups={2:[],3:[],4:[]}
    for size in groups:
        for ids in combinations(rows,size):
            common=rows[ids[0]]
            for key in ids[1:]: common=intersect_rows(common,rows[key])
            if common: groups[size].append(list(ids))
    band=1 if groups[3] or groups[4] else 2 if len(groups[2])>1 else 3 if groups[2] else 4
    return dict(pairs=groups[2],triples=groups[3],quadruples=groups[4],band=band,method=MASKS['method'])
