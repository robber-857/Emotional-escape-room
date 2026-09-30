"""Derive final score groups only from server-accepted facts, never clicks."""

GROUP_OPTIONS={
    "l1.crossing":{"bridge","swim","ring","boat"},"l1.talk.woman":{"yes"},"l1.talk.man":{"yes"},
    "l1.lamp":{"lit_taken","lit_left","unlit_taken","unlit_left"},
    "l2.seat":{"window","table","none"},"l2.first-try":{"attempt"},"l2.retry":{"retry","abandon"},
    "l2.explore":{"pending"},"l2.search":{"declined","short_quit","long","found_short"},
    **{"l2.furniture."+k:{"1","2","3","4"} for k in ("wall","tidiness","adjustments")},
    "l3.storm-door":{"unopened","opened","closed","unopened_closed"},"l3.wait":{"yes","no"},
    "l3.curtain":{"yes","no"},"l3.environment":{"both","window","television","neither"},
    "l3.item":{"none","scarf","lantern","umbrella","compass","doll","key","journal","rope","backpack"},
    "l4.door":{"village","coast","forest","castle"}}

# These scenes may legitimately end without any outcome from these groups.
OPTIONAL_GROUPS={"l1.talk.man","l1.talk.woman","l2.seat","l2.first-try","l2.retry","l2.explore","l2.search"}
UNRESOLVED_CONDITIONS={"l2.retry","l2.explore","l2.search"}


def candidates(level, before, state, action):
    found=[]
    def add(group, option, reason="APPLIED"):
        found.append(dict(group_id=group, option_id=option, reason=reason))
    if level == "l1":
        if state["route"] and not before.get("route"):
            add("l1.crossing", state["route"])
        for key, group in (("greeted", "l1.talk.man"), ("greetedWoman", "l1.talk.woman")):
            if state[key] and not before.get(key): add(group,"yes")
        if state["scene"] == "complete" and before["scene"] != "complete":
            add("l1.lamp", ("lit" if state["lampLit"] else "unlit")+("_taken" if state["lampTaken"] else "_left"))
    elif level == "l2":
        if action['type']=='sit' and action['yes']:
            add('l2.seat','window' if action['seat']=='chair' else 'table')
        elif action['type']=='arrive-table':
            add('l2.seat','window' if state['seat']=='chair' else 'table' if state['seat']=='table-seat' else 'none')
        if action["type"] == "try-door":
            if len(state["attempts"]) == 1: add("l2.first-try","attempt")
            elif len(state["attempts"]) == 2: add("l2.retry","retry")
        if action["type"] == "layout-confirm":
            for name in ("wall","tidiness","adjustments"):
                add("l2.furniture."+name,"quartile")
    elif level == "l3":
        c=state['choices']
        door_fixed=c['open'] is True and c['close'] is True
        previous_fixed=before['choices']['open'] is True and before['choices']['close'] is True
        if door_fixed and not previous_fixed:
            add('l3.storm-door','closed')
        if before["segment"] == "storm" and state["segment"] == "carry":
            c=state["choices"]
            if not door_fixed:
                add("l3.storm-door", "opened" if c["open"] else "unopened_closed" if c["close"] else "unopened")
            add("l3.wait", "yes" if c["wait"] else "no")
            add("l3.curtain", "yes" if c["curtain"] else "no")
            add("l3.environment", "both" if c["window"] and c["television"] else "window" if c["window"] else "television" if c["television"] else "neither")
        if state["completion"] == "complete" and before["completion"] != "complete":
            add("l3.item", state["item"] or "none")
    elif level == "l4" and state["completion"] == "complete" and before["completion"] != "complete":
        add("l4.door", state["door"])
    return found


def no_score_reason(level, action):
    if level == 'l3':
        return 'AWAITING_STORM_CUTOFF' if action['type']=='decision' else 'AWAITING_ITEM_CONFIRMATION'
    if level=='l2' and action['type']=='sit':
        return 'AWAITING_FIRST_SEAT_OR_TABLE'
    if action.get("yes") is False:
        return "AWAITING_FINALIZATION" if level in ("l2","l3") else "NO_SCORE_ON_NO"
    if level == "l1" and action.get("choice") in ("take-lamp","light-lamp"):
        return "AWAITING_FINALIZATION"
    if level == "l2" and action["type"] in ("sit","explore","search-choice","search-time","curtain-click","return-hall"):
        return "UNCONFIGURED_CONDITION"
    return "MECHANICAL_STEP"
