from itertools import product
import pytest
from app.portrait_policy import load_portrait_policy, select_portrait


@pytest.mark.parametrize('key,portrait',[
 ('LLHH','01'),('LLHL','02'),('LLLH','03'),('LLLL','04'),
 ('HLHH','05'),('HLHL','06'),('HLLH','07'),('HLLL','08'),
 ('LHHH','09'),('LHHL','10'),('LHLH','11'),('LHLL','12'),
 ('HHHH','13'),('HHHL','14'),('HHLH','15'),('HHLL','16'),
])
def test_every_user_supplied_mapping_and_exact_boundary(key,portrait):
    policy=load_portrait_policy()
    for low,high in [(0,100),(50,50.000001)]:
        vector={axis:high if sign=='H' else low for axis,sign in zip('AVTF',key)}
        assert select_portrait(vector,policy)==portrait


@pytest.mark.parametrize('value',[-.1,100.1,True,None,float('inf'),float('nan')])
def test_invalid_final_vector_never_selects_card(value):
    with pytest.raises(ValueError):select_portrait(dict(A=value,V=50,T=50,F=50),load_portrait_policy())


def test_all_50_is_negative_and_only_above_50_is_positive():
    policy=load_portrait_policy()
    assert select_portrait(dict.fromkeys('AVTF',50),policy)=='04'
    assert select_portrait(dict.fromkeys('AVTF',50.000001),policy)=='13'
