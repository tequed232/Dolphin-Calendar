// 只读取惰性文档节点，绝不把外部 HTML 注入应用 DOM。
export function tableRows(table:HTMLTableElement):string[][] {
  return [...table.rows].map(row=>[...row.cells].map(cell=>(cell.textContent??'').trim()));
}
export function gridSchedule(table:HTMLTableElement):{periods:Record<string,unknown>[]} | null {
  const rows=[...table.rows];
  const headerIndex=rows.findIndex(row=>[...row.cells].filter(c=>/^(?:星期|礼拜|周)[一二三四五六日天]$/.test(c.textContent?.trim()??'')).length>=2);
  if(headerIndex<0)return null;
  const header=[...rows[headerIndex].cells].map(c=>c.textContent?.trim()??'');
  const periods:Record<string,unknown>[]=[];
  for(const [rowIndex,row] of rows.slice(headerIndex+1).entries()){
    const cells=[...row.cells];
    if(cells.some(c=>c.rowSpan>1||c.colSpan>1))throw new Error(`网格第 ${rowIndex+1} 行包含合并单元格；请用内置提示词转换为 JSON，避免星期或节次错位`);
    if(cells.length!==header.length)throw new Error(`网格第 ${rowIndex+1} 行列数与星期表头不符`);
    const label=cells.find((_,i)=>! /^(?:星期|礼拜|周)[一二三四五六日天]$/.test(header[i]))?.textContent??'';
    const time=label.match(/\d{1,2}:\d{2}\s*[-–—~至]\s*\d{1,2}:\d{2}/)?.[0]??'';
    const sections=label.replace(time,'').trim();
    const days:Record<string,unknown>[][]=Array.from({length:7},()=>[]);
    periods.push({period:sections,time,days});
    for(let i=0;i<cells.length;i++){
      if(!/^(?:星期|礼拜|周)[一二三四五六日天]$/.test(header[i]))continue;
      const cell=cells[i];
      const copy=cell.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('script,style').forEach(e=>e.remove());
      copy.querySelectorAll('br').forEach(e=>e.replaceWith('\n'));
      copy.querySelectorAll('p,div').forEach(e=>e.append('\n'));
      const segments=(copy.textContent??'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
      if(!segments.length||segments.every(t=>/^[—\-无空\s]+$/.test(t)))continue;
      const weekIndex=segments.findIndex(s=>/\d.*周/.test(s)||/^(?:周次|weeks)[:：]/i.test(s));
      const weeks=weekIndex>=0?segments[weekIndex].replace(/^(?:周次|weeks)[:：]\s*/i,''):'';
      const parts=segments.filter((_,j)=>j!==weekIndex);
      const name=(parts.shift()??'').replace(/^(?:课程名|课程)[:：]\s*/,'');
      const teacher=parts.find(p=>/^(?:教师|老师)[:：]/.test(p));
      const room=parts.find(p=>/^(?:教室|地点)[:：]/.test(p));
      const unlabeled=parts.filter(p=>p!==teacher&&p!==room);
      if(unlabeled.length>2)throw new Error(`${name} 包含多门课程或不明确的字段，请转换为 JSON 后导入`);
      const day='一二三四五六日'.indexOf(header[i].slice(-1).replace('天','日'));
      days[day].push({name,weeks,teacher:teacher?.replace(/^(?:教师|老师)[:：]\s*/,'')??unlabeled[0]??'',room:room?.replace(/^(?:教室|地点)[:：]\s*/,'')??unlabeled[teacher?0:1]??''});
    }
  }
  return {periods};
}
