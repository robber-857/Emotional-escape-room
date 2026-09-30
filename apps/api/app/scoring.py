"""Stable extension point. No guessed weights, points, totals or completion."""
def evaluate_l2_event(action, state):
    # Future published policies consume server-validated facts here. Keep receipts immutable.
    facts = {}
    if action["type"] == "layout-confirm":
        furniture = state["furniture"]
        return dict(status='awaiting_l3_entry',policy_version=None,contributions=None,
                    facts=dict(placement=furniture['classification']),scope='L2-04')
    if action["type"] in ("search-time", "curtain-click", "return-hall"):
        facts["search"] = dict(state["search"], timing_source="bounded_client_report", timing_verified=False)
    return dict(status="pending_configuration", policy_version=None, contributions=None, facts=facts)
