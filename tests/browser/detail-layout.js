async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/detail-layout-harness',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset='utf-8'><style>body{margin:0}</style></head><body><div id='app'></div><script type='module'>
    import '/src/style.css';
    import {createDetailsDialog} from '/src/details-dialog.ts';
    const columns=Array.from({length:75},(_,i)=>'字段'+String(i+1).padStart(2,'0')+'：首样评审是否完成及相关日期');
    let hidden=[];
    const preferences={hiddenFields:()=>hidden,changeHiddenFields:keys=>hidden=keys,changeView:()=>{},saveHint:'本次为虚构的75字段布局检查。'};
    const data={columns,columnKeys:Object.fromEntries(columns.map((name,i)=>[name,'table/f'+i])),primaryTableId:'table',views:[{id:'view',name:'项目台账'}],viewId:'view',rows:Array.from({length:7},(_,r)=>({tableId:'table',tableName:'项目台账',recordId:'r'+r,cells:Object.fromEntries(columns.map((name,c)=>[name,c%3===0?'未完成':c%3===1?'2026/04/10':'很长的项目描述，用于检查固定列遮挡，记录'+(r+1)])),fieldIds:Object.fromEntries(columns.map((name,i)=>[name,'f'+i]))}))};
    createDetailsDialog(document.querySelector('#app'),async()=>{},preferences).open({category:'模具T0是否完成',series:'未完成',count:7},async()=>data);
  </script></body></html>`}));
  await page.setViewportSize({width:1497,height:540});
  await page.goto('http://127.0.0.1:5173/detail-layout-harness');
  await page.getByText('共 7 条记录',{exact:true}).waitFor();
  await page.locator('#details-grid').evaluate(el=>{el.scrollLeft=3400;el.scrollTop=55;});
  const fixed = page.locator('.details-table tbody tr').nth(2).locator('.details-open-col');
  await fixed.hover();
  await page.screenshot({path:'output/playwright/detail-overlap-fixed-table.png'});
  const diagnostics = await page.evaluate(()=>{
    const grid=document.querySelector('#details-grid'),table=document.querySelector('.details-table'),row=document.querySelector('.details-table tbody tr:hover');
    const firstHeader=table.querySelector('th'),firstCell=table.querySelector('td');
    const fixed=row?.querySelector('.details-open-col');
    return {scrollLeft:grid.scrollLeft,scrollTop:grid.scrollTop,firstHeaderWidth:firstHeader.getBoundingClientRect().width,firstCellWidth:firstCell.getBoundingClientRect().width,offset:getComputedStyle(table.querySelector('.details-open-col')).left,fixedBackground:fixed?getComputedStyle(fixed).backgroundColor:null,headerTop:table.querySelector('th:nth-child(3)').getBoundingClientRect().top,gridTop:grid.getBoundingClientRect().top};
  });
  const problems=[];
  if(Math.abs(diagnostics.firstCellWidth-parseFloat(diagnostics.offset))>0.5)problems.push('固定列偏移与实际序号列宽度不一致');
  if(diagnostics.fixedBackground?.startsWith('rgba'))problems.push('悬停行的固定列背景透明，横向滚动内容透出');
  if(errors.length)problems.push(errors.join(';'));
  await page.getByRole('button',{name:'显示字段 (75/75)',exact:true}).click();
  const opaqueTheme = await page.locator('#details-column-picker').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.evaluate(()=>document.documentElement.style.setProperty('--paper','rgba(255,255,255,0)'));
  await page.screenshot({path:'output/playwright/detail-overlap-fixed-picker.png'});
  const transparentTheme = await page.locator('#details-column-picker').evaluate(el=>getComputedStyle(el).backgroundColor);
  if(transparentTheme.startsWith('rgba'))problems.push('透明宿主主题使显示字段面板透出底部表格');
  const surfaces = await page.locator('.record-details,#details-grid,.details-table th,.details-table .details-number,.details-table .details-open-col,#details-field-search,#details-column-picker').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,background:getComputedStyle(el).backgroundColor})).filter(item=>item.background.startsWith('rgba')));
  if(surfaces.length)problems.push('仍有透明的覆盖层：'+JSON.stringify(surfaces));
  await page.locator('[data-detail-column]').last().uncheck();
  await page.getByRole('button',{name:'显示字段 (74/75)',exact:true}).waitFor();
  await page.getByRole('button',{name:'显示全部',exact:true}).click();
  await page.getByRole('button',{name:'关闭显示字段面板',exact:true}).click();
  await page.locator('#details-grid').evaluate(el=>{el.scrollLeft=9000;el.scrollTop=70;});
  const layerCheck=await page.evaluate(()=>{
    const grid=document.querySelector('#details-grid'),r=grid.getBoundingClientRect();
    const fixed=document.elementFromPoint(r.left+15,r.top+15)?.closest('th');
    const header=document.elementFromPoint(r.left+220,r.top+15)?.closest('th');
    return !!fixed&&!!header;
  });
  if(!layerCheck)problems.push('双向滚动后表头未覆盖行内容');
  for(const size of [{width:1497,height:450},{width:390,height:640}]) {
    await page.setViewportSize(size);
    await page.getByRole('button',{name:'显示字段 (75/75)',exact:true}).click();
    const fits=await page.locator('#details-column-picker').evaluate(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0;});
    if(!fits)problems.push('字段面板超出视口：'+JSON.stringify(size));
    await page.getByRole('button',{name:'关闭显示字段面板',exact:true}).click();
  }
  if(problems.length)throw new Error(JSON.stringify({problems,diagnostics,opaqueTheme,transparentTheme}));
  return {pass:true,diagnostics};
}
