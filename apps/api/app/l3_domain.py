"""Confirmed L3 flow. Preview logs are not server input."""
from copy import deepcopy

RULES_VERSION = "l3-flow-v1"
COMPLETION_POLICY_VERSION = "l3-two-objects-explicit-finish-v2"
MAX_EVENTS = 400
SLOTS = ("open", "close", "wait", "curtain", "window", "television")
ITEMS = ("scarf", "lantern", "umbrella", "compass", "doll", "key", "journal", "rope", "backpack")


def initial_state():
    return dict(segment="storm", choices=dict.fromkeys((*SLOTS, "right-window")), carry=None, draft=None,
                item=None, completion="in_progress", events=[])


def preparation_count(state):
    return sum(state["choices"].get(slot) is not None for slot in ("wait", "window", "curtain", "television"))


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
        if slot not in (*SLOTS, "right-window") or type(yes) is not bool:
            raise ValueError("INVALID_DECISION")
        if slot != "open" and s["choices"]["open"] is None:
            raise ValueError("OPEN_NOT_ANSWERED")
        if slot not in ("open", "close") and s["choices"]["close"] is None:
            raise ValueError("CLOSE_NOT_ANSWERED")
        if slot == "right-window" and s["choices"]["curtain"] is not True:
            raise ValueError("CURTAIN_NOT_OPEN")
        if s["choices"].get(slot) is True:
            raise ValueError("ACTION_ALREADY_EXECUTED")
        if s["choices"].get(slot) is yes:
            return s, False
        s["choices"][slot] = yes
    elif kind == "finish-preparation":
        if s["segment"] != "storm":
            raise ValueError("STORM_COMPLETE")
        if preparation_count(s) < 2:
            raise ValueError("PREPARATION_NOT_READY")
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
