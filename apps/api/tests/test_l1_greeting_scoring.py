from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import os

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import SQLAlchemyError

from app.db import l2_runs, score_actions, score_ledger
from app.main import app
from app.score_policy import bundle
from test_l1_api import client, session, send


GREETING_CHOICES = {'man': 'greet', 'woman': 'greet-woman'}
VALUES = {'yes': -2, 'no': 2, 'skipped': 0}


def scoring(client, parent, headers):
    response = client.get(f"/api/v1/sessions/{parent['id']}/scoring", headers=headers)
    assert response.status_code == 200
    return response.json()


def greetings(summary):
    return [entry for entry in summary['ledger'] if entry['group_id'].startswith('l1.talk.')]


def settlement_actions(summary):
    return [receipt for receipt in summary['actions'] if receipt['action']['type'] == 'greeting-finalize']


def finish_l1(client, parent, headers):
    assert send(client, parent, headers, 'enter')[0].status_code == 200
    return f"/api/v1/sessions/{parent['id']}/levels/l2"


@pytest.mark.parametrize('man', ['yes', 'no', 'skipped'])
@pytest.mark.parametrize('woman', ['yes', 'no', 'skipped'])
def test_each_greeting_outcome_settles_only_when_l2_starts(client, man, woman):
    parent, headers = session(client)
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    requests = []
    for person, option in [('man', man), ('woman', woman)]:
        if option == 'skipped':
            continue
        response, body = send(client, parent, headers, GREETING_CHOICES[person], yes=option == 'yes')
        assert response.status_code == 200
        effect = response.json()['score_effect']
        assert effect['reason'] == 'AWAITING_L2_ENTRY'
        assert effect['events'] == []
        requests.append((body, effect))
        duplicate = client.post(f"/api/v1/sessions/{parent['id']}/actions", headers=headers, json=body).json()
        assert duplicate['duplicate'] and duplicate['score_effect'] == effect
        assert greetings(scoring(client, parent, headers)) == []

    # Refresh restores accepted answers without finalizing the scene.
    parent.update(client.get(f"/api/v1/sessions/{parent['id']}", headers=headers).json())
    url = finish_l1(client, parent, headers)
    before = scoring(client, parent, headers)
    assert greetings(before) == [] and settlement_actions(before) == []
    assert before['levels']['l1']['complete'] is False
    assert before['levels']['l1']['axes']['V']['normalized'] is None
    assert client.get(url, headers=headers).status_code == 404
    assert greetings(scoring(client, parent, headers)) == []

    assert client.post(url, headers=headers, json={}).status_code == 200
    settled = scoring(client, parent, headers)
    rows = greetings(settled)
    assert len(rows) == 2
    expected = {'l1.talk.man': man, 'l1.talk.woman': woman}
    for row in rows:
        option = expected[row['group_id']]
        assert row['option_id'] == option
        assert row['status'] == 'applied' and row['level'] == 'l1'
        assert row['vector'] == dict(A=None, V=VALUES[option], T=None, F=None)
        assert row['cutoff_version'] == parent['version']
        assert row['evidence']['cutoff_state']['scene'] == 'complete'
        assert row['event_score_version'] == 'event-scores-v8-l1-greetings'
    actions = settlement_actions(settled)
    assert len(actions) == 1
    assert actions[0]['delta'] == dict(A=None, V=VALUES[man] + VALUES[woman], T=None, F=None)
    assert len(actions[0]['events']) == 2
    assert settled['levels']['l1']['complete'] is True
    assert settled['levels']['l1']['axes']['V']['raw'] == VALUES[man] + VALUES[woman]
    assert settled['levels']['l1']['axes']['V']['measured_groups'] == 2

    # Response loss, refresh, and retry must keep the two immutable entries.
    assert client.post(url, headers=headers, json={}).status_code == 200
    assert client.get(url, headers=headers).status_code == 200
    for body, effect in requests:
        duplicate = client.post(f"/api/v1/sessions/{parent['id']}/actions", headers=headers, json=body).json()
        assert duplicate['duplicate'] and duplicate['score_effect'] == effect
    repeated = scoring(client, parent, headers)
    assert greetings(repeated) == rows
    assert settlement_actions(repeated) == actions


@pytest.mark.parametrize('person', ['man', 'woman'])
def test_later_greeting_yes_replaces_retryable_refusal(client, person):
    parent, headers = session(client)
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    choice = GREETING_CHOICES[person]
    for _ in range(2):
        assert send(client, parent, headers, choice, yes=False)[0].status_code == 200
    assert send(client, parent, headers, choice, yes=True)[0].status_code == 200
    assert greetings(scoring(client, parent, headers)) == []
    # A rejected answer after success cannot replace the accepted yes.
    assert send(client, parent, headers, choice, yes=False)[0].status_code == 409
    url = finish_l1(client, parent, headers)
    assert client.post(url, headers=headers, json={}).status_code == 200
    rows = {row['group_id']: row for row in greetings(scoring(client, parent, headers))}
    assert rows[f'l1.talk.{person}']['option_id'] == 'yes'
    assert rows[f'l1.talk.{person}']['vector']['V'] == -2
    other = 'woman' if person == 'man' else 'man'
    assert rows[f'l1.talk.{other}']['option_id'] == 'skipped'


def test_rejected_greetings_are_not_treated_as_refusals(client):
    parent, headers = session(client)
    for choice in GREETING_CHOICES.values():
        assert send(client, parent, headers, choice, yes=False)[0].status_code == 409
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    url = finish_l1(client, parent, headers)
    assert client.post(url, headers=headers, json={}).status_code == 200
    rows = greetings(scoring(client, parent, headers))
    assert len(rows) == 2 and all(row['option_id'] == 'skipped' for row in rows)
    assert all(row['vector']['V'] == 0 for row in rows)


@pytest.mark.parametrize('failure', ['second-greeting', 'score-action'])
def test_greeting_settlement_and_l2_creation_roll_back_together(client, failure):
    parent, headers = session(client)
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    assert send(client, parent, headers, 'greet', yes=False)[0].status_code == 200
    url = finish_l1(client, parent, headers)
    inserts = 0

    def fail(conn, cursor, statement, parameters, context, executemany):
        nonlocal inserts
        if 'INSERT INTO score_ledger' in statement:
            inserts += 1
            if failure == 'second-greeting' and inserts == 2:
                raise SQLAlchemyError('injected second greeting failure')
        if failure == 'score-action' and 'INSERT INTO score_actions' in statement:
            raise SQLAlchemyError('injected greeting receipt failure')

    event.listen(app.state.engine, 'before_cursor_execute', fail)
    try:
        assert client.post(url, headers=headers, json={}).status_code == 503
    finally:
        event.remove(app.state.engine, 'before_cursor_execute', fail)
    with app.state.engine.connect() as conn:
        assert conn.execute(select(l2_runs).where(l2_runs.c.session_id == parent['id'])).first() is None
    failed = scoring(client, parent, headers)
    assert greetings(failed) == [] and settlement_actions(failed) == []
    assert failed['levels']['l1']['complete'] is False
    assert client.post(url, headers=headers, json={}).status_code == 200
    assert len(greetings(scoring(client, parent, headers))) == 2
    assert len(settlement_actions(scoring(client, parent, headers))) == 1


def test_old_bound_policy_keeps_immediate_yes_only_scores(client, monkeypatch):
    current, _ = bundle()
    legacy = deepcopy(current)
    legacy.pop('greeting_settlement_version')
    legacy['event_score_version'] = 'event-scores-v7-l2-explore'
    for group in ('l1.talk.man', 'l1.talk.woman'):
        legacy['groups'][group] = {'yes': legacy['groups'][group]['yes']}
    with monkeypatch.context() as old_policy:
        old_policy.setattr('app.score_service.bundle', lambda: (legacy, 'frozen-legacy-hash'))
        parent, headers = session(client)
    # A later journey binds the current policy without replacing the old snapshot.
    newer, newer_headers = session(client)
    assert scoring(client, newer, newer_headers)['event_score_version'] == 'event-scores-v8-l1-greetings'
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    yes = send(client, parent, headers, 'greet')[0].json()['score_effect']
    assert yes['delta'] == dict(A=None, V=-2, T=None, F=None)
    assert yes['events'][0]['group_id'] == 'l1.talk.man'
    assert send(client, parent, headers, 'greet-woman', yes=False)[0].json()['score_effect']['reason'] == 'NO_SCORE_ON_NO'
    saved = greetings(scoring(client, parent, headers))
    url = finish_l1(client, parent, headers)
    assert scoring(client, parent, headers)['levels']['l1']['complete'] is True
    assert client.post(url, headers=headers, json={}).status_code == 200
    summary = scoring(client, parent, headers)
    assert greetings(summary) == saved and len(saved) == 1
    assert settlement_actions(summary) == []
    assert summary['event_score_version'] == 'event-scores-v7-l2-explore'
    assert summary['policy_hash'] == 'frozen-legacy-hash'


@pytest.mark.skipif(not os.getenv('TEST_DATABASE_URL'), reason='isolated PostgreSQL required')
def test_concurrent_l2_start_finalizes_both_greetings_once(client):
    parent, headers = session(client)
    assert send(client, parent, headers, 'swim')[0].status_code == 200
    url = finish_l1(client, parent, headers)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post(url, headers=headers, json={}), range(2)))
    assert all(response.status_code == 200 for response in responses)
    with app.state.engine.connect() as conn:
        assert len(conn.execute(select(score_ledger).where(score_ledger.c.session_id == parent['id'],
            score_ledger.c.group_id.in_(['l1.talk.man', 'l1.talk.woman']))).all()) == 2
        receipts = conn.execute(select(score_actions.c.receipt).where(score_actions.c.session_id == parent['id'])).scalars().all()
    assert len([receipt for receipt in receipts if receipt['action']['type'] == 'greeting-finalize']) == 1
