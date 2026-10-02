"""L1 rules v1. UI coordinates are claims, validated here; never accept client state."""
from copy import deepcopy

RULES_VERSION = "l1-rules-v3-route-switch"
SUPPORTED_RULES_VERSIONS = ("l1-rules-v1", "l1-rules-v2-rope", RULES_VERSION)

def initial_state(): #初始化这一关
    return dict(scene="river", wood=False, repaired=False, ropeClicks=0, oar=False, bushClicks=0,
                rowing=False, strokes=0, route=None, greeted=False, greetedWoman=False,
                lampTaken=False, lampLit=False, events=[])

def normalize_state(state):
    # Existing sessions had a freely available rope. Preserve their progress.
    return {"ropeClicks": 5, **state}

def allowed(s, choice): #判断这个操作现在能不能做，s是当前状态，choice是要做的操作
    if s["scene"] == "complete": return False
    if s["scene"] == "shore":
        fields = {"greet": "greeted", "greet-woman": "greetedWoman",
                  "take-lamp": "lampTaken", "light-lamp": "lampLit"}
        return choice == "enter" or (choice in fields and not s[fields[choice]])
    return {"take-rope": s.get("ropeClicks", 5) < 5 and not s["repaired"],
            "collect-wood": not s["wood"] and not s["repaired"],
            "repair": s["wood"] and not s["repaired"], "cross-bridge": s["repaired"],
            "swim": True, "use-ring": True, "search": not s["oar"], "board": s["oar"] and not s["rowing"]}.get(choice, False)

def materials_ready(positions): #检查木板和绳子是不是真的拖到桥的位置
    for key, cx, cy in [("planks", 2446.355, 1426.75), ("rope", 2104.5, 1413.5)]:
        p = positions.get(key)
        if not p or not (760 <= cx + p["x"]*2944 <= 1160 and 1060 <= cy + p["y"]*1568 <= 1260):
            return False
    return True

def apply_action(state, action, positions):#真正执行游戏操作
    s = deepcopy(normalize_state(state))
    if s["ropeClicks"] < 5 and any(positions.get("rope", {}).values()):
        raise ValueError("ROPE_NOT_RELEASED")
    if action["type"] == "paddle":
        if s["scene"] != "river" or not s["rowing"] or not s["oar"] or s["strokes"] >= 5:
            raise ValueError("PADDLE_NOT_ALLOWED")
        s["strokes"] += 1
        if s["strokes"] == 5: s.update(scene="shore", rowing=False, route="boat")
        return s
    choice = action["choice"]
    if not allowed(s, choice): raise ValueError("ACTION_NOT_ALLOWED")
    if not action["yes"]: return s
    if choice in ("collect-wood", "repair") and s["ropeClicks"] < 5:
        raise ValueError("ROPE_NOT_RELEASED")
    if choice in ("collect-wood", "repair") and not materials_ready(positions):
        raise ValueError("REPAIR_MATERIALS_NOT_AT_GAP")
    if choice == "take-rope": s["ropeClicks"] += 1
    elif choice == "collect-wood": s["wood"] = True
    elif choice == "repair": s.update(repaired=True, wood=False)
    elif choice == "search":
        s["bushClicks"] += 1
        s["oar"] = s["bushClicks"] == 5
    elif choice == "board": s["rowing"] = True
    elif choice in ("cross-bridge", "swim", "use-ring"):
        s.update(scene="shore", rowing=False, route={"cross-bridge":"bridge", "swim":"swim", "use-ring":"ring"}[choice])
    elif choice == "enter": s["scene"] = "complete"
    else:
        s[{"greet":"greeted", "greet-woman":"greetedWoman", "take-lamp":"lampTaken", "light-lamp":"lampLit"}[choice]] = True
    return s
