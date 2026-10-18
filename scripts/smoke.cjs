// Run with Playwright available in NODE_PATH, or install it locally.
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const base=process.env.GAME_URL||'http://127.0.0.1:4180/';
const out=path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync('docs/catalog.json','utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results=[];
 try{
 if(process.argv.includes('--catalog')){
  for(const game of catalog.filter(g=>!process.env.GAME_IDS||process.env.GAME_IDS.split(',').includes(g.id))){const context=await browser.newContext({viewport:{width:1280,height:800}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)errors.push(`${r.status()} ${r.url().slice(base.length)}`)});
   try{const response=await page.goto(new URL(game.entry,base).href,{waitUntil:'load',timeout:20000});assert.equal(response.status(),200);await page.waitForTimeout(500);const title=await page.title();assert.ok(title);results.push({id:game.id,title,passed:errors.length===0,errors});}catch(e){results.push({id:game.id,passed:false,errors:[...errors,e.message]});}finally{await context.close()}
   if(results.length%10===0)console.log(`${results.length}/${catalog.length} loaded; ${results.filter(r=>!r.passed).length} failures`);
  }
  fs.writeFileSync(path.join(out,'catalog-smoke.json'),JSON.stringify(results,null,2));const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({checked:results.length,failures},null,2));if(failures.length)process.exitCode=1;
 }else{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.game').first().waitFor();assert.equal(await page.locator('.game').count(),96);await page.locator('#search').fill('Tanker');assert.equal(await page.locator('.game').count(),1);await page.locator('#search').fill('');await page.screenshot({path:path.join(out,'collection-desktop.png'),fullPage:false});
  await page.goto(base+'classics/?game=tictactoe');await page.locator('.board button').first().click();await page.waitForTimeout(450);assert.equal(await page.locator('.board button').filter({hasText:'O'}).count(),1);await page.locator('#restart').click();await page.locator('#opponent').selectOption('friend');for(const index of [0,3,1,4,2])await page.locator('.board button').nth(index).click();assert.match(await page.locator('#status').innerText(),/X wins/);
  await page.goto(base+'classics/?game=guess');await page.locator('#guess').fill('50');await page.locator('#guessForm button').click();assert.match(await page.locator('#status').innerText(),/low|high|Found/);assert.equal(await page.locator('#history span').count(),1);
  await page.goto(base+'classics/?game=cards');assert.equal(await page.locator('#hand .card').count(),7);await page.locator('#draw').click();await page.waitForTimeout(750);assert.ok(await page.locator('#hand .card').count()>=8);await page.screenshot({path:path.join(out,'color-clash.png')});
  await page.goto(base+'classics/?game=shooter');await page.locator('#launch').click();await page.keyboard.down(' ');await page.waitForTimeout(1400);await page.keyboard.up(' ');await page.keyboard.press('p');assert.match(await page.locator('#flightStatus').innerText(),/Paused/);await page.screenshot({path:path.join(out,'shooter.png')});
  await page.goto(base+'games/pilot-fuel-tanker-training/source/fuel-tanker-explorer.html');await page.waitForFunction(()=>Boolean(window.tankerAPI));await page.evaluate(()=>tankerAPI.mode('unload'));for(let i=0;i<6;i++)await page.locator('#stepNext').click();await page.waitForTimeout(100);assert.equal(await page.locator('#stepNext').isDisabled(),true);await page.waitForFunction(()=>!tankerAPI.state.busy);for(let i=0;i<8;i++){await page.locator('#stepNext').click();await page.waitForFunction(()=>!tankerAPI.state.busy)}assert.equal(await page.evaluate(()=>tankerAPI.state.hose),'stored');await page.locator('#stepNext').click();await page.screenshot({path:path.join(out,'tanker.png')});
  await page.setViewportSize({width:390,height:844});await page.goto(base);await page.locator('.game').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'collection-mobile.png')});
  await page.goto(base+'classics/?game=cards');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'cards-mobile.png')});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(base+'games/pilot-fuel-tanker-training/');
  await page.locator('[data-nav="/explorer"]').first().click();
  const frame=page.frameLocator('iframe');
  await frame.locator('#scene').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(out,'tanker-integrated.png')});
  assert.deepEqual(errors,[]);console.log('Focused desktop/mobile browser checks passed.');await context.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});



