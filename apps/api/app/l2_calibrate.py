"""Build a candidate quartile policy from exported first-confirmation evidence.

Does not activate the policy or alter sessions/receipts. One observation per run.
"""
import argparse
import json
from math import isfinite
from pathlib import Path
from statistics import quantiles
from .l2_metrics import METRIC_VERSION
from .l2_scoring import DIMENSIONS


def build_policy(samples, *, pool_id, pool_version, minimum_sample_size):
    if not pool_id or not pool_version or type(minimum_sample_size) is not int or minimum_sample_size < 2:
        raise ValueError("POOL_METADATA_REQUIRED")
    if len(samples) < minimum_sample_size:
        raise ValueError("INSUFFICIENT_POOL_SIZE")
    seen = set()
    values = {name: [] for name in DIMENSIONS}
    for sample in samples:
        sid = sample["session_id"]
        if not isinstance(sid, str) or not sid or sid in seen:
            raise ValueError("POOL_REQUIRES_UNIQUE_SESSIONS")
        seen.add(sid)
        placement = sample["placement"]
        if placement.get("ruleVersion") != METRIC_VERSION or placement.get("eligible") is not True:
            raise ValueError("INCOMPATIBLE_POOL_EVIDENCE")
        for metric in values:
            value = placement["metrics"][metric]
            if type(value) not in (int, float) or not isfinite(value) or value < 0:
                raise ValueError("INVALID_POOL_VALUE")
            if (metric == "adjustmentCount" and type(value) is not int) or (metric != "adjustmentCount" and value > 1):
                raise ValueError("INVALID_POOL_VALUE")
            values[metric].append(value)
    return dict(metric_version=METRIC_VERSION,
                pool=dict(id=pool_id, version=pool_version, sample_size=len(samples), minimum_sample_size=minimum_sample_size),
                quantile_method="inclusive-linear-interpolation", tie_policy="equal_to_lower_raw_bucket",
                thresholds={name: quantiles(data, n=4, method="inclusive") for name, data in values.items()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("samples", type=Path)
    parser.add_argument("--pool-id", required=True)
    parser.add_argument("--pool-version", required=True)
    parser.add_argument("--minimum-sample-size", required=True, type=int)
    args = parser.parse_args()
    print(json.dumps(build_policy(json.loads(args.samples.read_text(encoding="utf-8")), pool_id=args.pool_id,
                                 pool_version=args.pool_version, minimum_sample_size=args.minimum_sample_size), indent=2))
