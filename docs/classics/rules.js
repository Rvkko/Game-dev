// Pure rules shared by the browser games and deterministic regression tests.
export const COLORS = ['red','amber','green','blue'];
export function shuffled(items, random = Math.random) {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
export function createDeck() {
  const cards=[]; let id=0;
  for (const color of COLORS) {
    cards.push({id:id++,color,value:'0'});
    for(const value of ['1','2','3','4','5','6','7','8','9','skip','reverse','+2'])
      for(let i=0;i<2;i++) cards.push({id:id++,color,value});
  }
  for(const value of ['wild','+4']) for(let i=0;i<4;i++) cards.push({id:id++,color:'wild',value});
  return cards;
}
export function canPlay(card, top, color, hand=[]) {
  if(card.value==='+4') return !hand.some(c=>c.color===color);
  return card.color==='wild' || card.color===color || card.value===top.value;
}
export function newMatch(random=Math.random) {
  const deck=shuffled(createDeck(),random), hands=[deck.splice(0,7),deck.splice(0,7)];
  // A numeric opening avoids ambiguous opening action penalties.
  const first=deck.findIndex(c=>/^\d$/.test(c.value));
  const top=deck.splice(first,1)[0];
  return {deck,hands,discard:[top],color:top.color,turn:0,winner:null,message:'Your turn. Match the color or symbol.'};
}
export function drawCards(state,player,count,random=Math.random) {
  let drawn=0;
  while(drawn<count) {
    if(!state.deck.length && state.discard.length>1) {
      const top=state.discard.pop(); state.deck=shuffled(state.discard,random); state.discard=[top];
    }
    if(!state.deck.length) break;
    state.hands[player].push(state.deck.pop()); drawn++;
  }
  return drawn;
}
export function playCard(state,player,id,color) {
  if(state.winner!==null || state.turn!==player) return false;
  const hand=state.hands[player], index=hand.findIndex(c=>c.id===id), card=hand[index];
  if(!card || !canPlay(card,state.discard.at(-1),state.color,hand)) return false;
  if(card.color==='wild' && !COLORS.includes(color)) return false;
  hand.splice(index,1); state.discard.push(card); state.color=card.color==='wild'?color:card.color;
  const opponent=1-player;
  if(card.value==='+2' || card.value==='+4') drawCards(state,opponent,card.value==='+2'?2:4);
  if(!hand.length) { state.winner=player; state.message=player===0?'You win!':'Computer wins.'; return true; }
  const skip=['skip','reverse','+2','+4'].includes(card.value);
  state.turn=skip?player:opponent;
  state.message=skip ? `${player===0?'You':'Computer'} played ${card.value}. ${player===0?'Your':'Computer keeps the'} turn.` : (state.turn===0?'Your turn.':'Computer is thinking…');
  return true;
}
export function drawTurn(state,player) {
  if(state.winner!==null || state.turn!==player) return false;
  drawCards(state,player,1); state.turn=1-player;
  state.message=state.turn===0?'Computer drew. Your turn.':'You drew one. Computer is thinking…';
  return true;
}
export function boardResult(board) {
  for(const [a,b,c] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])
    if(board[a] && board[a]===board[b] && board[a]===board[c]) return board[a];
  return board.every(Boolean)?'draw':null;
}
export function bestMove(board,player='O') {
  const opponent=player==='O'?'X':'O';
  function score(b,turn,depth) {
    const result=boardResult(b);
    if(result) return result==='draw'?0:result===player?10-depth:depth-10;
    const scores=[];
    for(let i=0;i<9;i++) if(!b[i]) { b[i]=turn; scores.push(score(b,turn===player?opponent:player,depth+1)); b[i]=null; }
    return turn===player?Math.max(...scores):Math.min(...scores);
  }
  let best=-Infinity, index=-1;
  for(const i of [4,0,2,6,8,1,3,5,7]) if(!board[i]) {
    board[i]=player; const n=score(board,opponent,0); board[i]=null;
    if(n>best) { best=n; index=i; }
  }
  return index;
}
export function guessNumber(state,input) {
  const n=Number(input);
  if(state.done || String(input).trim()==='' || !Number.isInteger(n) || n<1 || n>100) return {valid:false,message:'Enter a whole number from 1 to 100.'};
  if(state.guesses.includes(n)) return {valid:false,message:'Already guessed. Try another number.'};
  state.guesses.push(n);
  if(n===state.secret) { state.done=true; state.won=true; return {valid:true,message:`Found it! ${n} in ${state.guesses.length} guesses.`}; }
  if(state.guesses.length===10) { state.done=true; return {valid:true,message:`Out of guesses. The number was ${state.secret}.`}; }
  if(n<state.secret) state.low=Math.max(state.low,n+1); else state.high=Math.min(state.high,n-1);
  return {valid:true,message:`${n} is too ${n<state.secret?'low':'high'}. ${10-state.guesses.length} guesses left.`};
}
