/** Follow the visible task Back control before choosing a root Dock destination. */
export async function goTab(page,name){
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog[open] button:disabled')).some(button=>/保存中|正在保存|正在导入/.test(button.textContent)));await page.waitForTimeout(80);
 for(let i=0;i<10&&await page.locator('.sub-screen.active').count();i++){
  await page.evaluate(()=>document.querySelector('.sub-screen.active .sub-header button[aria-label="返回上一页"]')?.click());
  await page.waitForTimeout(350);
  if(await page.getByRole('dialog',{name:'有尚未保存的内容',exact:true}).count())return false;
 }
 await page.locator('.dock').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(80);return true;
}
export async function pasteJSON(page){if(await page.locator('.screen.active .import-paste-option').count())await page.locator('.screen.active .import-paste-option').evaluate(el=>el.open=true);}
