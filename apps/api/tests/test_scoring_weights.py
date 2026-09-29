import json
import pytest
from app.scoring_weights import load_weights


def test_confirmed_weights():
    assert load_weights() == {"weight_version": "Scoring_weight_version_1", "weights": {"L1": .2, "L2": .3, "L3": .3, "L4": .2}}


def test_switch_version_keeps_explicit_old_values(tmp_path):
    path = tmp_path / "weights.json"
    old = load_weights()["weights"]
    new = dict(L1=.1, L2=.4, L3=.4, L4=.1)  # test fixture, not product defaults
    path.write_text(json.dumps(dict(schema_version=1, active_version="Scoring_weight_version_2", versions={"Scoring_weight_version_1": old, "Scoring_weight_version_2": new})), encoding="utf-8")
    assert load_weights(path=path)["weights"] == new
    assert load_weights("Scoring_weight_version_1", path=path)["weights"] == old
    with pytest.raises(ValueError, match="UNKNOWN_WEIGHT_VERSION"):
        load_weights("missing", path=path)


@pytest.mark.parametrize("weights", [{"L1": 1}, dict(L1=True,L2=0,L3=0,L4=0), dict(L1=-.1,L2=.4,L3=.4,L4=.3), dict(L1=.2,L2=.2,L3=.2,L4=.2), dict(L1=float('nan'),L2=.3,L3=.3,L4=.2)])
def test_invalid_weights_rejected(tmp_path, weights):
    path = tmp_path / "weights.json"
    path.write_text(json.dumps(dict(schema_version=1, active_version="Scoring_weight_version_1", versions={"Scoring_weight_version_1": weights})), encoding="utf-8")
    with pytest.raises(ValueError): load_weights(path=path)
