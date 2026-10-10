import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {launchBrowser} from './check-browser.mjs';
import {goTab} from './check-navigation.mjs';

// Exercise disk files through the real file picker, preview and AppState commit.
// IndexedDB is read only: no injected Schedule can satisfy these assertions.
const evidence = path.resolve('build/evidence');
await mkdir(evidence, {recursive: true});
const jsonPeriods = [
  ['07:35', '08:15'], ['08:25', '09:05'], ['09:25', '10:05'], ['10:15', '10:55'],
  ['13:10', '13:50'], ['14:00', '14:40'], ['15:00', '15:40'], ['15:50', '16:30'],
  ['18:00', '18:40'], ['18:50', '19:30'], ['19:40', '20:20'], ['20:30', '21:10'],
].map(([start, end]) => ({start, end}));
const fullCsvPeriods = [
  ['07:40', '08:20'], ['08:30', '09:10'], ['09:30', '10:10'], ['10:20', '11:00'],
  ['13:30', '14:10'], ['14:20', '15:00'], ['15:20', '16:00'], ['16:10', '16:50'],
  ['18:00', '18:35'], ['18:45', '19:20'], ['19:30', '20:05'], ['20:15', '20:50'],
  ['21:00', '21:35'], ['21:45', '22:20'],
].map(([start, end]) => ({start, end}));
const jsonFixture = {
  term: {name: '自定义时间学期', startDate: '2026-09-07', weeks: 20},
  courseCount: 12,
  times: jsonPeriods.map((period, i) => ({
    index: i + 1,
    startTime: period.start.replace(/^0/, ''),
    endTime: period.end.replace(/^0/, ''),
  })),
  courses: [{
    name: 'JSON 自定义数学', day: 3, start: 5, end: 6, weeks: [5],
    room: '16栋203号教室', teacher: '文件教师', notes: '从实际 JSON 文件读取',
  }],
};
const csvFixture = '课程名,星期,开始节次,结束节次,上课时间,下课时间,周次,教室,教师,备注\n'
  + 'CSV 自定义物理,周三,5,6,13:20,14:50,5,3栋402号教室,CSV教师,从实际 CSV 文件读取\n';
const clockCsvFixture = '节次,上课时间,下课时间\n'
  + fullCsvPeriods.map((period, i) => `${i + 1},${period.start.replace(/^0/, '')},${period.end.replace(/^0/, '')}`).join('\n') + '\n';
const fixtureFiles = {
  json: path.join(evidence, 'custom-timing.json'),
  csv: path.join(evidence, 'custom-timing.csv'),
  clocks: path.join(evidence, 'custom-period-times.csv'),
  conflict: path.join(evidence, 'invalid-time-conflict.csv'),
  partial: path.join(evidence, 'invalid-time-partial.csv'),
  invalid: path.join(evidence, 'invalid-time-format.csv'),
  overlap: path.join(evidence, 'invalid-time-overlap.csv'),
  jsonInvalid: path.join(evidence, 'invalid-time.json'),
};
await Promise.all([
  writeFile(fixtureFiles.json, JSON.stringify(jsonFixture, null, 2)),
  writeFile(fixtureFiles.csv, '\uFEFF' + csvFixture),
  writeFile(fixtureFiles.clocks, clockCsvFixture),
  writeFile(fixtureFiles.conflict, '课程名,星期,节次,上课时间,下课时间,周次\n冲突一,周三,5-6,13:30,15:00,5\n冲突二,周五,5-6,13:40,15:00,5\n'),
  writeFile(fixtureFiles.partial, '课程名,星期,节次,上课时间,下课时间,周次\n半对课程,周三,5-6,13:30,,5\n'),
  writeFile(fixtureFiles.invalid, '节次,上课时间,下课时间\n5,25:10,25:50\n'),
  writeFile(fixtureFiles.overlap, '节次,上课时间,下课时间\n5,13:30,14:25\n'),
  writeFile(fixtureFiles.jsonInvalid, JSON.stringify({...jsonFixture, times: [{index: 1, startTime: '25:00', endTime: '25:40'}], courseCount: 1})),
]);

const browser = await launchBrowser();
const page = await browser.newPage({viewport: {width: 390, height: 844}, timezoneId: 'Asia/Singapore', hasTouch: true});
const checks = [], errors = [], records = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.commands = [];
  window.Dolphin = {postMessage(raw) {window.commands.push(JSON.parse(raw));}};
});
await page.route('https://api.github.com/repos/tequed232/Dolphin-Calendar/releases/latest', route => route.fulfill({json: {
  tag_name: 'v1.4.3', name: '当前版本', body: '', published_at: '2026-10-07T00:00:00Z',
  html_url: 'https://github.com/tequed232/Dolphin-Calendar/releases/tag/v1.4.3',
}}));
const active = () => page.locator('.screen.active');
const preview = () => page.getByRole('dialog', {name: '确认这份课表', exact: true});
const reader = () => page.getByRole('dialog', {name: '读取课表', exact: true});
async function check(name, fn) {
  await fn(); checks.push(name); console.log('PASS ' + name);
}
async function stored() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('dolphin-calendar', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, read = db.transaction('state').objectStore('state').get('app');
      read.onsuccess = () => {resolve(read.result); db.close();};
      read.onerror = () => {reject(read.error); db.close();};
    };
  }));
}
async function syncCount() {return page.evaluate(() => window.commands.filter(command => command.type === 'sync').length);}
async function nativeMatches() {
  const schedule = (await stored()).schedule;
  await page.waitForFunction(expected => {
    const command = window.commands.filter(command => command.type === 'sync').at(-1);
    return JSON.stringify(command?.schedule) === JSON.stringify(expected);
  }, schedule);
  const native = await page.evaluate(() => window.commands.filter(command => command.type === 'sync').at(-1).schedule);
  assert.deepEqual(native, schedule);
  records.push({term: schedule.term, periods: schedule.periods, courses: schedule.courses.map(({id, name, day, start, end, weeks, room, teacher}) => ({id, name, day, start, end, weeks, room, teacher}))});
}
async function selectDate(value = '2026-10-07') {
  await page.evaluate(value => window.dolphinNative({type: 'date', value}), value);
  await page.waitForTimeout(100);
}
async function root(name = '列表') {await goTab(page, name); await active().waitFor();}
async function openFile(file, origin = '列表') {
  await root(origin);
  await active().getByRole('button', {name: '导入课表', exact: true}).click();
  await page.locator('.screen.active[data-screen=import]').waitFor();
  assert.equal(await page.locator('.primary-navigation').count(), 0);
  await active().getByLabel('选择课表文件', {exact: true}).setInputFiles(file);
}
async function filePreview(file, origin = '列表') {
  await openFile(file, origin);
  await preview().waitFor();
  assert.equal(await page.locator('.primary-navigation').count(), 0);
  assert.equal(await preview().locator('.import-steps [data-state=current]').count(), 1);
  assert.match(await preview().locator('.import-steps [aria-current=step]').innerText(), /^4\n预览变更/);
}
async function confirm(origin = 'list') {
  await preview().getByRole('button', {name: '确认导入', exact: true}).click();
  await page.locator(`.screen.active[data-screen=${origin}]`).waitFor();
  await nativeMatches();
}
async function back() {await active().getByRole('button', {name: '返回上一页', exact: true}).click(); await page.waitForTimeout(350);}
async function manage() {
  await root(); await active().getByRole('button', {name: '课表管理', exact: true}).click();
  await page.locator('.screen.active[data-screen=editor]').waitFor();
}
async function verifyTimesEditor(periods) {
  await manage(); await active().getByRole('button', {name: '上课时间', exact: true}).click();
  await page.locator('.screen.active[data-screen=times]').waitFor();
  assert.equal(await active().locator('.period-editor').count(), periods.length);
  assert.equal(await active().locator('.period-editor input[type=time]').count(), periods.length * 2);
  for(const [i, period] of periods.entries()) {
    assert.equal(await active().getByLabel(`第${i + 1}节开始`, {exact: true}).inputValue(), period.start);
    assert.equal(await active().getByLabel(`第${i + 1}节结束`, {exact: true}).inputValue(), period.end);
  }
  assert.equal(await page.locator('.primary-navigation').count(), 0);
  await root();
}
async function verifyCourseChoices(count) {
  await manage(); await active().getByRole('button', {name: '添加', exact: true}).click();
  const editor = page.getByRole('dialog', {name: '添加课程', exact: true});
  await editor.getByRole('button', {name: '开始节次', exact: true}).click();
  assert.equal(await editor.getByRole('listbox', {name: '开始节次', exact: true}).getByRole('option').count(), count);
  await editor.getByRole('option', {name: `第 ${count} 节`, exact: true}).click();
  await editor.getByRole('button', {name: '结束节次', exact: true}).click();
  assert.equal(await editor.getByRole('listbox', {name: '结束节次', exact: true}).getByRole('option').count(), count);
  await editor.getByRole('button', {name: '结束节次', exact: true}).click();
  // Selection was deliberately changed to prove choices work; discard that draft.
  await editor.getByRole('button', {name: '取消', exact: true}).click();
  const discard = page.getByRole('dialog', {name: '修改还未保存', exact: true});
  await discard.getByRole('button', {name: '放弃修改', exact: true}).click();
  await root();
}
async function verifyHome(name, periods) {
  await root('列表'); await selectDate();
  assert.equal(await active().locator('.period-row').count(), periods.length);
  const card = active().locator('.course-card').filter({has: page.locator('h3', {hasText: name})});
  await card.waitFor();
  assert.match(await card.getAttribute('aria-label'), new RegExp(periods[4].start + String.raw`\s*–\s*` + periods[5].end));
  await card.click();
  const sheet = page.getByRole('dialog', {name: `${name}详情`, exact: true});
  assert.match(await sheet.locator('.teacher').innerText(), new RegExp(periods[4].start + '–' + periods[5].end));
  await sheet.getByRole('button', {name: '关闭课程详情', exact: true}).click();
  await root('平铺');
  assert.equal(await active().locator('.grid-period').count(), periods.length);
  for(const [i, period] of periods.entries()) {
    const row = active().locator(`.grid-period[data-period="${i + 1}"]`);
    assert.equal(await row.locator('small').nth(0).innerText(), period.start);
    assert.equal(await row.locator('small').nth(1).innerText(), period.end);
  }
  assert.equal(await active().locator('.grid-course strong').filter({hasText: name}).count(), 1);
  assert.equal(await page.locator('.resize-handle').count(), 0);
}
async function rejectFile(file, expected) {
  const before = (await stored()).schedule, count = await syncCount();
  await openFile(file);
  await reader().getByRole('alert').waitFor();
  const message = await reader().getByRole('alert').innerText();
  assert.match(message, expected);
  assert.equal(await preview().count(), 0);
  assert.equal(await reader().getByRole('button', {name: '查看导入预览', exact: true}).count(), 0);
  await reader().getByRole('button', {name: '取消', exact: true}).click();
  await back();
  assert.deepEqual((await stored()).schedule, before);
  assert.equal(await syncCount(), count);
  records.push({rejectedFile: path.basename(file), message});
}

try {
  await page.clock.setFixedTime(new Date('2026-10-07T06:05:00Z'));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173');
  await page.getByRole('button', {name: '先逛一逛', exact: true}).click();
  await page.locator('.screen.active[data-screen=list]').waitFor();
  // Configure a smaller baseline through the real UI, so the JSON must grow it.
  await manage(); await active().getByRole('button', {name: /开学日期与课程节数/}).click();
  await active().getByLabel('课程节数', {exact: true}).selectOption('10');
  await active().getByRole('button', {name: '保存课表设置', exact: true}).click();
  await root(); await nativeMatches();
  const original = (await stored()).schedule;
  const originalSync = await syncCount();
  await check('文件入口自动识别 JSON / CSV，二级页隐藏 Dock，步骤及卡片保留原有圆角', async () => {
    await active().getByRole('button', {name: '导入课表', exact: true}).click();
    assert.equal(await page.locator('.primary-navigation').count(), 0);
    assert.match(await active().locator('.import-file-option').innerText(), /JSON · CSV · Excel/);
    assert.equal(await active().locator('.import-steps li').count(), 5);
    assert.match(await active().locator('.import-steps [aria-current=step]').innerText(), /^1\n选择文件/);
    assert.ok(Number.parseFloat(await active().locator('.import-file-option').evaluate(el => getComputedStyle(el).borderRadius)) >= 14);
    await active().getByLabel('选择课表文件', {exact: true}).setInputFiles(fixtureFiles.json);
    await preview().waitFor();
  });
  await check('磁盘 JSON 的 times.index / startTime / endTime / H:mm 被规范化，预览前原数据不变', async () => {
    assert.match(await preview().locator('.import-changes').innerText(), /将修改.*开学日期.*每日节数.*每节上课 \/ 下课时间/s);
    assert.equal(await preview().locator('.import-times p:not(.import-rest)').count(), 12);
    await preview().locator('.import-times').evaluate(el => el.open = true);
    assert.match(await preview().locator('.import-times p:not(.import-rest)').first().innerText(), /07:35–08:15/);
    assert.match(await preview().locator('.preview-list').innerText(), /JSON 自定义数学.*5–6 节.*16栋203号教室/s);
    assert.deepEqual((await stored()).schedule, original);
    assert.equal(await syncCount(), originalSync);
    assert.ok(Number.parseFloat(await preview().evaluate(el => getComputedStyle(el).borderRadius)) >= 20);
    assert.ok(Number.parseFloat(await preview().locator('.import-changes').evaluate(el => getComputedStyle(el).borderRadius)) >= 12);
  });
  await check('确认 JSON 更新学期 / 12 节及全部自定义时间，原生 sync 与持久化状态一致', async () => {
    await confirm();
    const schedule = (await stored()).schedule;
    assert.deepEqual(schedule.term, jsonFixture.term);
    assert.deepEqual(schedule.periods, jsonPeriods);
    assert.equal(schedule.courses[0].name, jsonFixture.courses[0].name);
    assert.equal(schedule.courses[0].teacher, '文件教师');
    assert.equal(schedule.courses[0].notes, '从实际 JSON 文件读取');
  });
  await check('JSON 自定义时段立即显示于列表、平铺和课程详情，无重复时间来源', async () => {
    await verifyHome('JSON 自定义数学', jsonPeriods);
  });
  await check('JSON 配置同步课表管理、24 个时间输入和课程编辑器 12 节选项', async () => {
    await manage(); await active().getByRole('button', {name: /开学日期与课程节数/}).click();
    assert.equal(await active().getByRole('button', {name: '开学日期', exact: true}).innerText(), '2026/09/07');
    assert.equal(await active().getByLabel('学期周数', {exact: true}).inputValue(), '20');
    assert.equal(await active().getByLabel('课程节数', {exact: true}).inputValue(), '12');
    await verifyTimesEditor(jsonPeriods); await verifyCourseChoices(12);
  });
  await check('刷新后 JSON 学期 / 课程 / 自定义时间仍保留，两种主页继续使用导入值', async () => {
    const before = (await stored()).schedule;
    await page.reload(); await page.locator('.screen.active').waitFor();
    assert.deepEqual((await stored()).schedule, before);
    await nativeMatches(); await verifyHome('JSON 自定义数学', jsonPeriods);
  });
  const csvPeriods = jsonPeriods.map(period => ({...period}));
  csvPeriods[4].start = '13:20'; csvPeriods[5].end = '14:50';
  await check('磁盘 CSV 读取自定义上课 / 下课时间，预览说明修改时间并保留缺省学期配置', async () => {
    await filePreview(fixtureFiles.csv);
    const changes = await preview().locator('.import-changes').innerText();
    assert.match(changes, /将修改.*课程.*每节上课 \/ 下课时间/s);
    assert.match(changes, /将保留.*开学日期：2026-09-07.*学期周数：20.*每日节数：12/s);
    await preview().locator('.import-times').evaluate(el => el.open = true);
    assert.match(await preview().locator('.import-times p:not(.import-rest)').nth(4).innerText(), /13:20–13:50/);
    assert.match(await preview().locator('.import-times p:not(.import-rest)').nth(5).innerText(), /14:00–14:50/);
    assert.equal((await stored()).schedule.courses[0].name, 'JSON 自定义数学');
  });
  await check('CSV 预览取消保留课表 / 时间及原生同步状态，不偷偷提交', async () => {
    const before = (await stored()).schedule, count = await syncCount();
    await preview().getByRole('button', {name: '返回修改', exact: true}).click(); await reader().getByRole('button', {name: '取消', exact: true}).click(); await back();
    assert.deepEqual((await stored()).schedule, before); assert.equal(await syncCount(), count);
  });
  await check('确认 CSV 更新课程及连堂首尾边界，中间节次与缺省学期元数据沿用且同步原生', async () => {
    await filePreview(fixtureFiles.csv); await confirm();
    const schedule = (await stored()).schedule;
    assert.deepEqual(schedule.term, jsonFixture.term); assert.deepEqual(schedule.periods, csvPeriods);
    assert.equal(schedule.courses[0].name, 'CSV 自定义物理');
    assert.equal(schedule.courses[0].room, '3栋402号教室');
    assert.equal(schedule.courses[0].teacher, 'CSV教师');
    assert.equal(schedule.courses[0].notes, '从实际 CSV 文件读取');
    assert.deepEqual(schedule.courses[0].weeks, [5]);
    await verifyHome('CSV 自定义物理', csvPeriods);
    await verifyTimesEditor(csvPeriods); await verifyCourseChoices(12);
  });
  const csvCourses = (await stored()).schedule.courses;
  await check('完整独立 CSV 时间表按 1–14 节设置每日节数，预览声明仅更新配置并保留课程 ID', async () => {
    await filePreview(fixtureFiles.clocks);
    const changes = await preview().locator('.import-changes').innerText();
    assert.match(changes, /每日节数：12 → 14/);
    assert.match(changes, /将保留.*原有课程/s);
    assert.match(await preview().innerText(), /仅更新课表配置/);
    assert.equal(await preview().locator('.import-times p:not(.import-rest)').count(), 14);
    assert.deepEqual((await stored()).schedule.courses, csvCourses);
  });
  await check('确认独立 CSV 时间表，14 节时间应用所有界面并保留课程、学期和 ID', async () => {
    await confirm();
    const schedule = (await stored()).schedule;
    assert.deepEqual(schedule.term, jsonFixture.term); assert.deepEqual(schedule.periods, fullCsvPeriods);
    assert.deepEqual(schedule.courses, csvCourses);
    await verifyHome('CSV 自定义物理', fullCsvPeriods);
    await verifyTimesEditor(fullCsvPeriods); await verifyCourseChoices(14);
  });
  await check('CSV 同节边界冲突给出具体行 / 节次原因，原课表不变', () => rejectFile(fixtureFiles.conflict, /(?:第.*行|第.*节).*冲突|冲突.*(?:第.*行|第.*节)/s));
  await check('CSV 时间缺半对拒绝导入，原课表不变', () => rejectFile(fixtureFiles.partial, /上课.*下课.*(?:一起|同时|成对)|缺.*(?:时间|下课)/s));
  await check('CSV 非法时钟拒绝导入并指出格式错误，原课表不变', () => rejectFile(fixtureFiles.invalid, /(?:第.*行|第.*节).*时间|时间.*(?:无效|格式|HH:mm)/s));
  await check('CSV 节次时间重叠拒绝导入并指出具体节次，原课表不变', () => rejectFile(fixtureFiles.overlap, /重叠|倒序|晚于/s));
  await check('JSON 非法自定义时间拒绝导入，原课程和合法时间不变', () => rejectFile(fixtureFiles.jsonInvalid, /第 1 节.*时间|时间.*HH:mm/s));
  await check('最终刷新保持 CSV 自定义时间，课程卡片 / 导入卡片圆角及底部安全区正确', async () => {
    const before = (await stored()).schedule;
    await root('平铺'); await page.reload(); await page.locator('.screen.active[data-screen=grid]').waitFor();
    assert.deepEqual((await stored()).schedule, before); await nativeMatches(); await selectDate();
    await page.evaluate(() => window.dolphinInsets(28, 32));
    assert.ok(Number.parseFloat(await active().locator('.grid-course').evaluate(el => getComputedStyle(el).borderRadius)) >= 8);
    assert.ok(Number.parseFloat(await active().locator('.home-controls').evaluate(el => getComputedStyle(el).borderRadius)) >= 20);
    await active().evaluate(el => el.scrollTop = el.scrollHeight); await page.waitForTimeout(100);
    const row = await active().locator('.grid-period[data-period="14"]').boundingBox(), dock = await page.locator('.primary-navigation').boundingBox();
    assert.ok(row.y + row.height < dock.y - 8, JSON.stringify({row, dock}));
    await active().locator('.grid-course').evaluate(el => {const screen = el.closest('.screen'), header = screen.querySelector('.home-controls').getBoundingClientRect(), dock = document.querySelector('.primary-navigation').getBoundingClientRect(); screen.scrollTop += el.getBoundingClientRect().top - header.bottom - (dock.top - header.bottom) * .25;});
    await page.screenshot({path: path.join(evidence, 'file-times-grid.png')});
    await active().getByRole('button', {name: '导入课表', exact: true}).click();
    assert.equal(await page.locator('.primary-navigation').count(), 0);
    await active().evaluate(el => el.scrollTop = el.scrollHeight);
    const last = await active().locator('.import-local-note').boundingBox();
    assert.ok(last.y + last.height < 844 - 32, JSON.stringify(last));
    await back(); await page.evaluate(() => window.dolphinInsets(0, 0));
  });
  const jsonLunchFile=path.join(evidence,'custom-lunch-times.json'),csvLunchFile=path.join(evidence,'custom-lunch-times.csv'),badLunchFile=path.join(evidence,'invalid-lunch-overlap.csv');
  const jsonLunchPeriods=jsonPeriods.map(p=>({...p})),csvLunchPeriods=fullCsvPeriods.map(p=>({...p}));
  jsonLunchPeriods[3].breakAfter={label:'午休',start:'11:05',end:'13:05'};
  csvLunchPeriods[3].breakAfter={label:'午休',start:'11:15',end:'13:30'};
  const lunchEntries=jsonPeriods.map((p,i)=>({index:i+1,timeRange:`${p.start} 至 ${p.end}`}));
  lunchEntries.splice(4,0,{label:'午休',timeRange:'11:05–13:05'});
  await Promise.all([
    writeFile(jsonLunchFile,JSON.stringify({...jsonFixture,times:lunchEntries},null,2)),
    writeFile(csvLunchFile,'节次,时间段\n'+fullCsvPeriods.map((p,i)=>`${i+1},${p.start}–${p.end}`).toSpliced(4,0,'午休,11:15–13:30').join('\n')+'\n'),
    writeFile(badLunchFile,'节次,上课时间,下课时间\n午休,10:30,13:30\n'),
  ]);
  await check('真实 JSON 时间段与午休自动预览，确认后写入同一课表并同步课时、网格和设置',async()=>{
    const before=(await stored()).schedule;
    await filePreview(jsonLunchFile);await preview().locator('.import-times summary').click();
    assert.match(await preview().locator('.import-rest').first().innerText(),/午休\s*11:05–13:05/);
    assert.deepEqual((await stored()).schedule,before);
    await confirm();assert.deepEqual((await stored()).schedule.periods,jsonLunchPeriods);
    await verifyHome('JSON 自定义数学',jsonLunchPeriods);
    await active().locator('.grid-period[data-period="4"] .grid-break-label').waitFor();
    assert.equal(await active().locator('.grid-period[data-period="4"] .grid-break-label').getAttribute('aria-label'),'午休 11:05–13:05');
    await verifyTimesEditor(jsonLunchPeriods);await manage();await active().getByRole('button',{name:'上课时间',exact:true}).click();
    assert.match(await active().locator('.period-rest').first().innerText(),/午休 · 11:05–13:05/);
    await page.screenshot({path:path.join(evidence,'imported-lunch-settings.png')});await root();
  });
  await check('真实 CSV 合并时间列和午休行自动识别为14节，保留课程 ID 和未提供的学期数据',async()=>{
    const before=(await stored()).schedule;
    await filePreview(csvLunchFile);await preview().locator('.import-times summary').click();
    assert.match(await preview().locator('.import-rest').first().innerText(),/午休\s*11:15–13:30/);
    await confirm();const schedule=(await stored()).schedule;
    assert.deepEqual(schedule.periods,csvLunchPeriods);assert.deepEqual(schedule.courses,before.courses);assert.deepEqual(schedule.term,before.term);
    await verifyHome('JSON 自定义数学',csvLunchPeriods);await verifyTimesEditor(csvLunchPeriods);
  });
  await check('午休时间重叠明确报错，不更改已保存的课程或时间',async()=>{
    await rejectFile(badLunchFile,/午休.*重叠/);
  });
  await check('重新打开应用后自动导入的上课、下课及午休时间仍保留',async()=>{
    const before=(await stored()).schedule;await page.reload();await active().waitFor();
    assert.deepEqual((await stored()).schedule,before);await nativeMatches();await verifyTimesEditor(csvLunchPeriods);
  });
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'file-times-results.json'), JSON.stringify({
    at: new Date().toISOString(), transport: 'real disk files → input[type=file] → preview → AppState → IndexedDB + native sync',
    fixtureFiles: Object.fromEntries(Object.entries(fixtureFiles).map(([key, file]) => [key, path.relative(process.cwd(), file)])),
    checks, errors, records,
  }, null, 2));
  await Promise.all(['file-times-failure.png', 'file-times-failure.json'].map(file => rm(path.join(evidence, file), {force: true})));
} catch(error) {
  await page.screenshot({path: path.join(evidence, 'file-times-failure.png')}).catch(() => {});
  await writeFile(path.join(evidence, 'file-times-failure.json'), JSON.stringify({checks, errors, failure: String(error)}, null, 2));
  throw error;
} finally {await browser.close();}
