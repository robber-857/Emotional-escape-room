"""L4 confirms exactly one exit. Local previews and scores are not inputs."""
from copy import deepcopy

RULES_VERSION = "l4-flow-v1"
COMPLETION_POLICY_VERSION = "l4-confirm-door-v1"
DOORS = ("village", "coast", "forest", "castle")


def initial_state(item=None):
    return dict(door=None, item=item, completion="in_progress", events=[])


def apply_action(state, action):
    if state["completion"] == "complete":
        raise ValueError("L4_COMPLETE")
    if action.get("type") != "confirm" or action.get("door") not in DOORS:
        raise ValueError("INVALID_DOOR")
    result = deepcopy(state)
    result.update(door=action["door"], completion="complete")
    return result
