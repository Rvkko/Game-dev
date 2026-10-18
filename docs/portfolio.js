const $=s=>document.querySelector(s);
let games=[];
function render(){
  const query=$('#search').value.trim().toLowerCase(),category=$('#category').value;
  const visible=games.filter(g=>(!query||`${g.title} ${g.category} ${g.description} ${g.source}`.toLowerCase().includes(query))&&(category==='all'||g.category===category)&&($('#prototypes').checked||g.category!=='prototype'));
  $('#results').textContent=`${visible.length} of ${games.length} projects shown`;
  $('#empty').hidden=visible.length>0;
  $('#catalog').replaceChildren(...visible.map(g=>{
    const article=document.createElement('article');article.className='game';
    const art=document.createElement('div');art.className='art';art.setAttribute('aria-hidden','true');
    if(g.source==='Gaming Empire'&&g.category!=='prototype'){
      const image=document.createElement('img');image.src=`games/${g.id}/thumb.jpg`;image.alt='';image.loading='lazy';image.onerror=()=>{image.remove();art.textContent=g.title.slice(0,2).toUpperCase()};art.append(image);
    }else art.textContent=({shooter:'↟',cards:'◆',tictactoe:'×○',guess:'42','heartwood-caravan':'❧','voxhaven-original':'▦','astral-ascendancy':'✦'})[g.id]||'◈';
    const content=document.createElement('div');content.className='game-content';
    const meta=document.createElement('span');meta.className='meta';meta.textContent=g.category;
    const title=document.createElement('h3');title.textContent=g.title;
    const desc=document.createElement('p');desc.textContent=g.description;
    const status=document.createElement('span');status.className='status';status.textContent=g.status;
    const play=document.createElement('a');play.className='play';play.href=g.entry;play.textContent=g.category==='prototype'?'Open prototype →':'Play →';play.setAttribute('aria-label',`${play.textContent} ${g.title}`);
    content.append(meta,title,desc,status,play);article.append(art,content);return article;
  }));
}
try{
  const response=await fetch('catalog.json');if(!response.ok)throw new Error(`Catalog returned ${response.status}`);games=await response.json();
  $('#count').textContent=`/ ${games.length}`;
  for(const category of [...new Set(games.map(g=>g.category))].sort()){const o=document.createElement('option');o.value=category;o.textContent=category[0].toUpperCase()+category.slice(1);$('#category').append(o)}
  for(const selector of ['#search','#category','#prototypes'])$(selector).addEventListener('input',render);render();
}catch(error){$('#results').textContent=`The catalog could not load. ${error.message}. Use the Empire hub link above, or refresh.`}
