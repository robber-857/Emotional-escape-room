"""Immutable L4 receipt evidence; formal scoring remains unconfigured."""
from .l4_domain import COMPLETION_POLICY_VERSION

AUTHORITY = dict(record_source="server_database", decision_source="server", input_source="client_claim")
VALIDATION_VERSION = "l4-validation-v1"


def pending_scoring():
    return dict(status="pending_configuration", policy_version=None, contributions=None, totals=None)


def outcome(state):
    return dict(door=state["door"], item=state["item"], completion=state["completion"],
                completion_policy_version=COMPLETION_POLICY_VERSION)
