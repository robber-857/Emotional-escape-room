"""Stable extension point. No guessed weights, points, totals or completion."""
from .l2_scoring import evaluate
def evaluate_l2_event(action, state):
    # Future published policies consume server-validated facts here. Keep receipts immutable.
    facts = {}
    if action["type"] == "layout-confirm":
        furniture = state["furniture"]
        if furniture["assessment"] is not None:
            return dict(status="already_assessed", policy_version=furniture["assessment"]["scoring"]["policy_version"],
                        contributions=None, facts=dict(placement=furniture["classification"]), scope="L2-04")
        return evaluate(furniture["classification"])
    if action["type"] in ("search-time", "curtain-click", "return-hall"):
        facts["search"] = dict(state["search"], timing_source="bounded_client_report", timing_verified=False)
    return dict(status="pending_configuration", policy_version=None, contributions=None, facts=facts)
