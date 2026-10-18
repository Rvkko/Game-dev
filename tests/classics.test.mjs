import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeck,newMatch,canPlay,playCard,drawCards,drawTurn,boardResult,bestMove,guessNumber} from '../docs/classics/rules.js';
import {createFlight,tick} from '../docs/classics/shooter.js';
test('deck is 108 unique cards; dealing preserves the complete deck',()=>{
  const deck=createDeck();assert.equal(deck.length,108);assert.equal(new Set(deck.map(c=>c.id)).size,108);
  const s=newMatch(()=>.3);assert.equal(s.hands[0].length,7);assert.equal(s.hands[1].length,7);assert.equal(s.deck.length,93);assert.match(s.discard[0].value,/^\d$/);
});
test('wild draw four is blocked when active color exists',()=>{
  const top={color:'red',value:'5'},wild={color:'wild',value:'+4'};
  assert.equal(canPlay(wild,top,'red',[wild,{color:'red',value:'1'}]),false);
  assert.equal(canPlay(wild,top,'red',[wild,{color:'blue',value:'1'}]),true);
});
function match(value='skip'){return {deck:createDeck().slice(10,30),hands:[[{id:1,color:'red',value},{id:2,color:'blue',value:'8'}],[{id:3,color:'green',value:'3'}]],discard:[{id:4,color:'red',value:'6'}],color:'red',turn:0,winner:null};}
test('skip, reverse, draw penalties obey two-player turns',()=>{
  for(const value of ['skip','reverse','+2','+4']){const s=match(value);if(value==='+4')s.hands[0][0].color='wild';assert.ok(playCard(s,0,1,'blue'));assert.equal(s.turn,0);assert.equal(s.hands[1].length,value==='+2'?3:value==='+4'?5:1);}
});
test('invalid and out-of-turn moves cannot mutate the game',()=>{
  const s=match('7'),before=JSON.stringify(s);assert.equal(playCard(s,1,3,'green'),false);assert.equal(playCard(s,0,2,'blue'),false);assert.equal(JSON.stringify(s),before);
});
test('last card wins and no move/draw can alter a finished game',()=>{
  const s=match('7');s.hands[0].pop();assert.ok(playCard(s,0,1,'red'));assert.equal(s.winner,0);const before=JSON.stringify(s);assert.equal(drawTurn(s,0),false);assert.equal(JSON.stringify(s),before);
});
test('deck exhaustion recycles discards and preserves top',()=>{
  const s=match();s.deck=[];s.discard.unshift({id:8,color:'blue',value:'2'});drawCards(s,0,5,()=>.2);assert.equal(s.hands[0].length,3);assert.equal(s.discard.at(-1).id,4);
});
test('perfect tic-tac-toe AI never loses across every human move sequence',()=>{
  function walk(board,turn){const result=boardResult(board);if(result){assert.notEqual(result,'X');return;}if(turn==='O'){const i=bestMove(board);assert.ok(i>=0&&!board[i]);board[i]='O';walk(board,'X');board[i]=null;}else for(let i=0;i<9;i++)if(!board[i]){board[i]='X';walk(board,'O');board[i]=null;}}
  walk(Array(9).fill(null),'X');walk(Array(9).fill(null),'O');
});
test('tenth correct guess wins; invalid/repeated guesses cost nothing',()=>{
  const s={secret:100,guesses:[],low:1,high:100,done:false};
  for(const invalid of ['',0,101,'hello',1.5])assert.equal(guessNumber(s,invalid).valid,false);
  for(let n=1;n<=9;n++)guessNumber(s,n);
  assert.equal(guessNumber(s,1).valid,false);const result=guessNumber(s,100);assert.match(result.message,/Found it/);assert.equal(s.won,true);assert.equal(s.guesses.length,10);
});
test('number game loss reveals answer and becomes immutable',()=>{
  const s={secret:100,guesses:[],low:1,high:100,done:false};for(let i=1;i<=10;i++)guessNumber(s,i);assert.equal(s.done,true);assert.equal(s.won,undefined);assert.equal(guessNumber(s,100).valid,false);
});
test('shooter collision consumes enemy once and respects invulnerability',()=>{
  const s=createFlight();s.spawn=999;s.enemies=[{x:s.x,y:s.y,speed:0},{x:s.x,y:s.y,speed:0}];tick(s,.016);assert.equal(s.hp,2);assert.equal(s.enemies.length,0);tick(s,.016);assert.equal(s.hp,2);
});
test('shooter pickup restores shields; rapid fire expires; entities are bounded',()=>{
  const s=createFlight();s.hp=1;s.spawn=999;s.pickups=[{x:s.x,y:s.y,type:'health'},{x:s.x,y:s.y,type:'rapid'}];tick(s,.016);assert.equal(s.hp,2);assert.equal(s.rapid,6);for(let i=0;i<200;i++)tick(s,.04,{fire:true},()=>.5);assert.equal(s.rapid,0);assert.ok(s.bullets.length<=32);assert.ok(s.enemies.length<=18);assert.ok(s.particles.length<=160);
});
test('shooter advances waves and terminates at a real victory',()=>{
  const s=createFlight();s.kills=95;s.spawn=999;s.enemies=[{x:100,y:100,speed:0}];s.bullets=[{x:100,y:108}];tick(s,.016);assert.equal(s.kills,96);assert.equal(s.won,true);assert.equal(s.over,true);const score=s.score;tick(s,.04,{fire:true});assert.equal(s.score,score);
});
