import pytest

from app.score_policy import bundle
from app.score_normalization import level_summary, weighted_summary
from app.results import build_result
from test_l1_api import client
from test_l2_api import act
from test_l3_api import open_l3


@pytest.mark.parametrize('opened,closed,option,v,t', [
    (False, False, 'unopened', 2, 1),
    (True, False, 'opened', -2, 1),
    (True, True, 'closed', 0, -2),
    (False, True, 'unopened_closed', 2, -1),
])
def test_door_outcomes_settle_once(client, opened, closed, option, v, t):
    parent, headers, url, state = open_l3(client)
    for slot, yes in [('open', opened), ('close', closed), ('window', False),
                      ('curtain', True), ('right-window', False),
                      ('television', False), ('wait', True)]:
        assert act(client, url, headers, state, dict(type='decision', slot=slot, yes=yes))[0].status_code == 200
    response, body = act(client, url, headers, state, dict(type='finish-preparation'))
    assert response.status_code == 200
    assert client.post(url + '/actions', headers=headers, json=body).json()['duplicate']
    summary = client.get(f"/api/v1/sessions/{parent['id']}/scoring", headers=headers).json()
    rows = [e for e in summary['ledger'] if e['group_id'] == 'l3.storm-door']
    assert len(rows) == 1
    assert rows[0]['option_id'] == option
    assert rows[0]['status'] == 'applied'
    assert rows[0]['vector'] == dict(A=None, V=v, T=t, F=None)
    assert rows[0]['event_score_version'] == 'event-scores-v9-l3-door-close'


def test_close_without_opening_supplies_only_missing_t_for_result():
    policy, _ = bundle()
    assert 'l3.storm-door/unopened_closed' not in policy['temporary_null_options']
    choices = {
        'l1': [('l1.crossing', 'swim'), ('l1.lamp', 'unlit_left'),
               ('l1.talk.man', 'skipped'), ('l1.talk.woman', 'skipped')],
        'l2': [('l2.seat', 'window'), ('l2.first-try', 'attempt')],
        'l3': [('l3.storm-door', 'unopened_closed'), ('l3.wait', 'yes'),
               ('l3.curtain', 'yes'), ('l3.environment', 'neither'), ('l3.item', 'none')],
        'l4': [('l4.door', 'forest')],
    }
    levels = {}
    for level, options in choices.items():
        entries = []
        for group, option in options:
            rule = policy['groups'][group][option]
            entries.append(dict(group_id=group, vector=rule['vector'],
                                status='applied' if rule['status'] == 'configured' else rule['status']))
        levels[level] = level_summary(level, policy, entries, True)
    assert all(levels[level]['axes']['T']['status'] == 'not_measured' for level in ('l1', 'l2', 'l4'))
    assert levels['l3']['axes']['T']['raw'] == -1
    final = weighted_summary(levels)
    assert final['status'] == 'ready'
    assert final['axes']['T']['effective_weights'] == {'l3': 1.0}
    assert final['vector']['T'] == pytest.approx(100 / 3)
    result = build_result('test', {}, {'final': final}, policy['portrait_policy'])
    assert result['status'] == 'ready'
    assert result['portrait_id'] is not None
