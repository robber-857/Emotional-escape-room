"""Confirmed L3 flow. Preview logs and legacy fan slots are not server input."""
from copy import deepcopy

RULES_VERSION = "l3-flow-v1"
COMPLETION_POLICY_VERSION = "l3-answers-item-v1"
MAX_EVENTS = 400
SLOTS = ("open", "close", "wait", "curtain", "window", "television")
ITEMS = ("scarf", "lantern", "umbrella", "compass", "doll", "key", "journal", "rope", "backpack")


def initial_state():
    return dict(segment="storm", choices=dict.fromkeys(SLOTS), carry=None, draft=None,
                item=None, completion="in_progress", events=[])


def apply_action(state, action):
    """Return a new state and whether a distinct flow event occurred."""
    s = deepcopy(state)
    kind = action["type"]
    if s["completion"] == "complete":
        raise ValueError("L3_COMPLETE")
    if kind == "decision":
        if s["segment"] != "storm":
            raise ValueError("STORM_COMPLETE")
        slot, yes = action["slot"], action["yes"]
        if slot not in SLOTS or type(yes) is not bool:
            raise ValueError("INVALID_DECISION")
        if slot != "open" and s["choices"]["open"] is None:
            raise ValueError("OPEN_NOT_ANSWERED")
        if slot not in ("open", "close") and s["choices"]["close"] is None:
            raise ValueError("CLOSE_NOT_ANSWERED")
        if s["choices"][slot] is True:
            raise ValueError("ACTION_ALREADY_EXECUTED")
        if s["choices"][slot] is yes:
            return s, False
        s["choices"][slot] = yes
        if all(value is not None for value in s["choices"].values()):
            s["segment"] = "carry"
    else:
        if s["segment"] != "carry":
            raise ValueError("STORM_NOT_COMPLETE")
        if kind == "carry":
            if s["carry"] is not None:
                raise ValueError("CARRY_ALREADY_ANSWERED")
            if type(action["yes"]) is not bool:
                raise ValueError("INVALID_DECISION")
            s["carry"] = action["yes"]
            if not s["carry"]:
                s["completion"] = "complete"
        elif kind in ("draft", "confirm"):
            if s["carry"] is not True:
                raise ValueError("CARRY_NOT_ACCEPTED")
            if kind == "draft":
                if action["item"] not in ITEMS:
                    raise ValueError("INVALID_ITEM")
                if s["draft"] == action["item"]:
                    raise ValueError("NO_CHANGE")
                s["draft"] = action["item"]
            else:
                if s["draft"] is None:
                    raise ValueError("ITEM_NOT_SELECTED")
                s["item"] = s["draft"]
                s["completion"] = "complete"
        else:
            raise ValueError("UNKNOWN_ACTION")
    return s, True
