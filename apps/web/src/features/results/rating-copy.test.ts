import test from 'node:test';
import assert from 'node:assert/strict';
import {ratingCopies,resolveRatingCopy} from './rating-copy';
import {portraits} from './portraits';
test('every supplied portrait has five independent slots for each metric',()=>{
 assert.deepEqual(ratingCopies.map(c=>c.portraitId),portraits.map(p=>p.id));
 for(const card of ratingCopies)for(const metric of ['authenticity','love'] as const){
  assert.deepEqual(Object.keys(card[metric]),['1','2','3','4','5']);
  for(let star=1;star<=5;star++)assert.equal(resolveRatingCopy(card.portraitId,metric,star),card[metric][String(star)]);
 }
});
test('selects only the requested metric and rating, without inventing missing copy',()=>{
 const card=ratingCopies[15];const previous=card.authenticity['4'];
 try{card.authenticity['4']={title:'测试标题',body:'仅真我值四星文案'};
  assert.equal(resolveRatingCopy('16','authenticity',4)?.body,'仅真我值四星文案');
  assert.equal(resolveRatingCopy('16','love',4),null);
  assert.equal(resolveRatingCopy('16','authenticity',3),null);
  assert.equal(resolveRatingCopy('16','authenticity',0),null);
  assert.equal(resolveRatingCopy('99','authenticity',4),null);
 }finally{card.authenticity['4']=previous;}
});
