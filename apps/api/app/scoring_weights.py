"""Validated weight configuration; not an event scoring/normalization algorithm.

Future scoring must persist the selected version AND weights with its result.
Never resolve an old result using the current active version.
"""
import json
import math
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config" / "scoring-weights.json"
LEVELS = {"L1", "L2", "L3", "L4"}


def load_weights(version=None, *, path=CONFIG_PATH):
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if config.get("schema_version") != 1:
        raise ValueError("UNSUPPORTED_WEIGHT_SCHEMA")
    versions = config.get("versions")
    if not isinstance(versions, dict) or not versions:
        raise ValueError("INVALID_WEIGHT_VERSIONS")
    for name, weights in versions.items():
        if not isinstance(name, str) or not name.startswith("Scoring_weight_version_"):
            raise ValueError("INVALID_WEIGHT_VERSION_NAME")
        if not isinstance(weights, dict) or set(weights) != LEVELS:
            raise ValueError("WEIGHTS_REQUIRE_L1_L2_L3_L4")
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in weights.values()):
            raise ValueError("INVALID_LEVEL_WEIGHT")
        if not math.isclose(sum(weights.values()), 1.0, rel_tol=0, abs_tol=1e-9):
            raise ValueError("WEIGHTS_MUST_SUM_TO_ONE")
    if config.get("active_version") not in versions:
        raise ValueError("UNKNOWN_ACTIVE_WEIGHT_VERSION")
    selected = config["active_version"] if version is None else version
    if selected not in versions:
        raise ValueError("UNKNOWN_WEIGHT_VERSION")
    return {"weight_version": selected, "weights": dict(versions[selected])}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version")
    args = parser.parse_args()
    print(json.dumps(load_weights(args.version), ensure_ascii=False, indent=2))
