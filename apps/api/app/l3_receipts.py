"""Immutable outcomes captured inside the same transaction as the L3 state."""
from copy import deepcopy
from .l3_domain import COMPLETION_POLICY_VERSION

AUTHORITY = dict(record_source="server_database", decision_source="server", input_source="client_claim")
VALIDATION_VERSION = "l3-validation-v2"


def outcome(state):
    return deepcopy(dict(segment=state["segment"], choices=state["choices"],
                         television_off=state["choices"]["television"] is True,
                         carry=state["carry"], draft=state["draft"], item=state["item"],
                         completion=state["completion"], completion_policy_version=COMPLETION_POLICY_VERSION))


def pending_scoring():
    # Supplied storm vectors are not an approved scoring configuration.
    return dict(status="pending_configuration", policy_version=None, contributions=None, totals=None)
