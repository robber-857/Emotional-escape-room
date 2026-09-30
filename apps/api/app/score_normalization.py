"""Fixed theoretical bounds, never min/max of a player's observed actions."""
from math import isfinite
from .score_policy import AXES
from .score_rules import OPTIONAL_GROUPS, UNRESOLVED_CONDITIONS


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
    unresolved=[k for k,v in groups.items() if any(o["status"] == "unconfigured" for o in v.values())]
    unresolved += list(set(groups)&UNRESOLVED_CONDITIONS)
    unresolved += [e["group_id"] for e in entries if e["status"] == "unconfigured"]
    axes={}
    for axis in AXES:
        lower=upper=0
        for group,options in groups.items():
            values=[o["vector"][axis] or 0 for o in options.values() if o["vector"] is not None]
            if group in OPTIONAL_GROUPS:values.append(0)
            if values: lower+=min(values);upper+=max(values)
        measured=[e["vector"][axis] for e in entries if e["status"] == "applied" and e["vector"][axis] is not None]
        raw=sum(measured) if measured else None
        projected=normalize(raw, lower, upper)
        axes[axis]=dict(raw=raw, lower=lower, upper=upper, measured_groups=len(measured),
                        provisional=projected,
                        normalized=projected if complete and not unresolved else None,
                        status="not_measured" if not measured else "pending_configuration" if unresolved else "final" if complete else "in_progress")
    total_lower=total_upper=0
    for group,options in groups.items():
        values=[sum(v for v in o["vector"].values() if v is not None) for o in options.values() if o["vector"] is not None]
        if group in OPTIONAL_GROUPS:values.append(0)
        if values: total_lower+=min(values);total_upper+=max(values)
    numbers=[v for e in entries if e["status"]=="applied" for v in e["vector"].values() if v is not None]
    raw=sum(numbers) if numbers else None
    projected=normalize(raw,total_lower,total_upper)
    total=dict(raw=raw,lower=total_lower,upper=total_upper,provisional=projected,
               normalized=projected if complete and not unresolved else None,
               status="pending_configuration" if unresolved else "final" if complete else "in_progress")
    return dict(level=level, complete=complete, weight=policy["weights"][level.upper()], axes=axes,total=total,
                pending_groups=sorted(set(unresolved)), ledger_count=len(entries))


def weighted_summary(levels):
    # User-confirmed: one normalized total per level, fixed level weights.
    # Four dimensions remain diagnostics, never independently reweighted.
    known=sum(v["total"]["provisional"]*v["weight"] for v in levels.values() if v["total"]["provisional"] is not None)
    if not all(v["complete"] for v in levels.values()):
        return dict(status="in_progress",score=None,known_contribution=known)
    if any(v["total"]["normalized"] is None for v in levels.values()):
        return dict(status="pending_configuration",score=None,known_contribution=known)
    return dict(status="ready",score=sum(v["total"]["normalized"]*v["weight"] for v in levels.values()),known_contribution=known)
