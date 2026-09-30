"""Persist per-action server outcomes; never infer history from a later snapshot."""
from copy import deepcopy
from .l2_domain import COMPLETION_POLICY_VERSION

AUTHORITY = dict(record_source="server_database", decision_source="server", input_source="client_claim")
VALIDATION_VERSION = "l2-validation-v7"

def outcome(action, state, previous_state=None):
    kind = action["type"]
    result = dict(view=state["view"])
    if kind == "try-door":
        result.update(attempt=len(state["attempts"]), key=action["key"], door_open=state["doorOpen"])
    elif kind in ("arrive-table", "sit", "select-key"):
        result.update(at_table=state["atTable"], seat=state["seat"], keys=state["keys"], selected_key=state["selectedKey"])
    elif kind in ("search-choice", "search-time", "curtain-click", "return-hall"):
        result.update(search=state["search"], timing_source="bounded_client_report", timing_verified=False)
    elif kind.startswith("layout-"):
        f = state["furniture"]
        result.update(editing=f["editing"], layout=f["layout"], adjustment_count=f["adjustmentCount"], count_version=f["countVersion"])
        if previous_state is not None:
            result["previous_layout"] = previous_state["furniture"]["layout"]
        if kind == "layout-confirm":
            result.update(classification=f["classification"], exit_door_open=state["exitDoorOpen"], completion_policy_version=COMPLETION_POLICY_VERSION)
    return deepcopy(result)
