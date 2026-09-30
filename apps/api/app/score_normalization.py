"""Normalize and combine each axis independently; never sum AVTF."""
from math import isfinite
from .score_policy import AXES
from .score_rules import OPTIONAL_GROUPS, UNRESOLVED_CONDITIONS
from .results import stars


def normalize(raw, lower, upper):
    if raw is None or lower is None or upper is None or upper == lower:
        return None
    if not all(isfinite(v) for v in (raw, lower, upper)) or lower > upper:
        raise ValueError("INVALID_NORMALIZATION_RANGE")
    if raw < lower-1e-9 or raw > upper+1e-9:
        raise ValueError("RAW_SCORE_OUTSIDE_POLICY_BOUNDS")
    return max(0., min(100., 100*(raw-lower)/(upper-lower)))


def level_summary(level, policy, entries, complete):
    groups={k:v for k,v in policy["groups"].items() if k.startswith(level+".")}
    pending={}
    for group, options in groups.items():
        reasons=[]
        if any(o['status']=='unconfigured' for o in options.values()): reasons.append('MISSING_VALUES')
        if group in UNRESOLVED_CONDITIONS and group not in policy.get('temporary_unresolved_conditions',[]): reasons.append('MISSING_CONDITION')
        if group.startswith('l2.furniture.') and policy['quartile_policy'] is None: reasons.append('MISSING_QUARTILE_THRESHOLDS')
        reasons += [e['reason'] for e in entries if e['group_id']==group and e['status']=='unconfigured']
        if reasons: pending[group]=sorted(set(reasons))
    axes={}
    for axis in AXES:
        lower=upper=0
        relevant=set()
        for group,options in groups.items():
            # Missing vectors have unknown axes; do not silently exclude them.
            if any(o['vector'] is None or o['vector'][axis] is not None for o in options.values()): relevant.add(group)
            values=[o['vector'][axis] or 0 for o in options.values() if o['vector'] is not None]
            if group in OPTIONAL_GROUPS: values.append(0)
            if values: lower+=min(values);upper+=max(values)
        unresolved=sorted(relevant & pending.keys())
        measured=[e['vector'][axis] for e in entries if e['status']=='applied' and e['vector'][axis] is not None]
        raw=sum(measured) if measured else None
        # Partial action streams need not yet fit the final theoretical interval.
        projected=normalize(raw,lower,upper) if raw is not None and lower<=raw<=upper else None
        status='pending_configuration' if unresolved else 'not_measured' if raw is None else 'degenerate_range' if lower==upper else 'final' if complete else 'in_progress'
        axes[axis]=dict(raw=raw,lower=lower,upper=upper,measured_groups=len(measured),
                        provisional=projected,normalized=projected if status=='final' else None,
                        status=status,pending_groups=unresolved)
    return dict(level=level,complete=complete,weight=policy['weights'][level.upper()],axes=axes,
                pending_groups=sorted(pending),pending_details=pending,ledger_count=len(entries))


def weighted_summary(levels):
    complete=len(levels)==4 and all(v['complete'] for v in levels.values())
    axes={}
    for axis in AXES:
        included={k:v for k,v in levels.items() if v['axes'][axis]['status']!='not_measured'}
        denominator=sum(v['weight'] for v in included.values())
        pending=[k for k,v in included.items() if v['axes'][axis]['normalized'] is None]
        status='in_progress' if not complete else 'not_measured' if not included or denominator==0 else 'pending_configuration' if pending else 'ready'
        score=sum(v['axes'][axis]['normalized']*v['weight'] for v in included.values())/denominator if status=='ready' else None
        axes[axis]=dict(score=score,status=status,weight_sum=denominator,
                        effective_weights={k:v['weight']/denominator for k,v in included.items()} if denominator else {},pending_levels=pending)
    vector={a:v['score'] for a,v in axes.items()}
    metrics={key:dict(axis=a,score=vector[a],stars=stars(vector[a])) if vector[a] is not None else None for key,a in [('authenticity','T'),('love','F')]}
    return dict(status='in_progress' if not complete else 'ready' if all(v is not None for v in vector.values()) else 'pending_configuration',
                axes=axes,vector=vector,metrics=metrics)
