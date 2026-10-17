/** Follow the visible task Back control before choosing a primary destination. */
export async function goTab(page,name){
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog[open] button:disabled')).some(button=>/保存中|正在保存|正在导入/.test(button.textContent)));await page.waitForTimeout(80);
 for(let i=0;i<10&&await page.locator('.sub-screen.active').count();i++){
  await page.evaluate(()=>document.querySelector('.sub-screen.active .sub-header button[aria-label="返回上一页"]')?.click());
  await page.waitForTimeout(350);
  if(await page.getByRole('dialog',{name:'有尚未保存的内容',exact:true}).count())return false;
 }
 const navigation=page.locator('.primary-navigation');
 if(await navigation.count())await navigation.getByRole('button',{name,exact:true}).click();
 else{
  // APK business tests use the same callback emitted by its native navigation view.
  // Actual Android button geometry and touch stay covered by check-native-navigation.
  const tab=({'列表':'list','平铺':'grid','搜索':'search','设置':'settings'})[name];
  if(!tab||!await page.evaluate(()=>!!window.Dolphin&&!!window.dolphinNative))throw new Error('主导航尚未就绪');
  await page.evaluate(tab=>window.dolphinNative({type:'selectTab',value:tab}),tab);
 }
 await page.waitForTimeout(80);return true;
}
export async function pasteJSON(page){const option=page.locator('.screen.active .import-paste-option');await option.waitFor();await option.evaluate(el=>el.open=true);}
