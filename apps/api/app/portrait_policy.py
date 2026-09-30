"""Versioned, user-supplied AVTF-to-portrait mapping. No inferred assignments."""
import json
from itertools import product
from math import isfinite
from pathlib import Path

CONFIG_PATH=Path(__file__).parent/'config'/'portrait-policy.json'


def load_portrait_policy():
    config=json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    if config.get('schema_version')!=1:
        raise ValueError('INVALID_PORTRAIT_POLICY')
    active=config.get('active_version')
    if active is None:
        return None
    policy=config['versions'][active]
    thresholds=policy['thresholds']
    if set(thresholds)!=set('AVTF') or any(type(v) not in (int,float) or not isfinite(v) or not 0<v<100 for v in thresholds.values()):
        raise ValueError('INVALID_PORTRAIT_THRESHOLDS')
    if policy.get('equal_to') not in ('high','low'):
        raise ValueError('INVALID_PORTRAIT_TIE_POLICY')
    if set(policy['portraits'])!={''.join(bits) for bits in product('LH',repeat=4)} or set(policy['portraits'].values())!={f'{i:02}' for i in range(1,17)}:
        raise ValueError('INVALID_PORTRAIT_MAPPING')
    return dict(policy,version=active)


def select_portrait(vector,policy):
    if policy is None:
        return None
    if set(vector)!=set('AVTF') or any(type(v) not in (int,float) or not isfinite(v) or not 0<=v<=100 for v in vector.values()):
        raise ValueError('INVALID_AVTF_VECTOR')
    key=''.join('H' if vector[a]>policy['thresholds'][a] or (vector[a]==policy['thresholds'][a] and policy['equal_to']=='high') else 'L' for a in 'AVTF')
    return policy['portraits'][key]
