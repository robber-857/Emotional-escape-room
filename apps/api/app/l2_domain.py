"""L2 authoritative facts. Furniture confirmation unlocks the exit; scoring remains unconfigured."""
from copy import deepcopy
from .l2_layout import initial_layout, move_layout, classify

RULES_VERSION = "l2-rules-v1"
MAX_EVENTS = 1000

def initial_state():
    return dict(exitDoorOpen=False, furniture=dict(baseline=initial_layout(), triggered=dict(tidy=False, openPlacement=False), editing=False,
                              layout=initial_layout(), history=[], confirmed=None, classification=None),
                search=dict(curtainClicks=0, status="idle", activeMs=0, long=False), view="room", attempts=[], doorOpen=False,
                atTable=False, seat=None, keys=[], selectedKey=None, events=[])

COMPLETION_POLICY_VERSION = "l2-furniture-exit-v1"

def with_completion(state):
    s = deepcopy(state)
    # Existing persisted tidy evidence came from a successful confirmation.
    s.setdefault("exitDoorOpen", bool(s["furniture"]["triggered"]["tidy"]))
    return s

def apply_action(state, a):
    s = with_completion(state); t = a["type"]; f = s["furniture"]; search = s["search"]
    def require(ok, code="ACTION_NOT_ALLOWED"):
        if not ok: raise ValueError(code)
    if t.startswith("layout-"):
        require(s["view"] == "room")
        require(not f["editing"] if t == "layout-start" else f["editing"])
        if t == "layout-start": f["editing"] = True
        elif t == "layout-exit": f["editing"] = False
        elif t == "layout-confirm":
            result = classify(f["layout"], f["baseline"], f["triggered"])
            s["exitDoorOpen"] = s["exitDoorOpen"] or result["tidy"]
            f.update(editing=False, confirmed=deepcopy(f["layout"]), baseline=deepcopy(f["layout"]), classification=result)
            f["triggered"] = dict(tidy=f["triggered"]["tidy"] or result["tidy"], openPlacement=f["triggered"]["openPlacement"] or result["openPlacement"])
        elif t == "layout-undo":
            require(bool(f["history"])); f.update(layout=f["history"].pop(), confirmed=None, classification=None)
        else:
            layout = initial_layout() if t == "layout-reset" else move_layout(f["layout"], a["id"], a["point"])
            require(layout != f["layout"], "NO_CHANGE")
            f.update(history=(f["history"]+[deepcopy(f["layout"])])[-50:], layout=layout, confirmed=None, classification=None)
        return s
    require(not f["editing"])
    if t in ("search-choice", "search-time", "curtain-click", "return-hall"):
        require(s["view"] == "bedroom")
        if t == "return-hall":
            s["view"] = "room"
            if search["status"] == "searching": search["status"] = "returned"
        elif t == "search-choice":
            require(search["status"] not in ("searching", "found"))
            search.update(status="searching" if a["yes"] else "declined", activeMs=0, long=False)
        elif t == "search-time":
            require(search["status"] == "searching")
            require(0 < a["activeMs"]-search["activeMs"] <= 10000, "INVALID_ACTIVE_TIME")
            search.update(activeMs=a["activeMs"], long=a["activeMs"] > 15000)
        else:
            require(search["status"] == "searching" and search["curtainClicks"] < 3)
            search["curtainClicks"] += 1
            if search["curtainClicks"] == 3: search["status"] = "found"
        return s
    require(s["view"] != "bedroom")
    available = s["atTable"] or s["seat"] == "table-seat"
    if t == "explore":
        require(s["doorOpen"] and s["view"] == "room")
        if a["yes"]: s["view"] = "bedroom"
    elif t == "view":
        require(s["view"] != a["view"] and (a["view"] != "table" or available))
        s["view"] = a["view"]
    elif t == "arrive-table":
        require(s["view"] == "room" and not s["atTable"]); s["atTable"] = True
    elif t == "sit":
        require(s["view"] == "room")
        if a["yes"]:
            s["seat"] = a["seat"]
            if a["seat"] == "table-seat": s.update(atTable=True, view="table")
    elif t == "select-key":
        require(available and s["selectedKey"] != a["key"])
        s["selectedKey"] = a["key"]
        if a["key"] not in s["keys"]: s["keys"].append(a["key"])
    elif t == "try-door":
        require(not s["doorOpen"] and a["key"] in s["keys"] and a["key"] not in s["attempts"])
        s["attempts"].append(a["key"]); s.update(view="room", doorOpen=len(s["attempts"]) == 2)
    else: raise ValueError("ACTION_NOT_ALLOWED")
    return s
