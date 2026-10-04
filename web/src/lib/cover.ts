export async function compressCover(file:File):Promise<string> {
  if(!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if(file.size>30*1024*1024) throw new Error('图片超过 30 MB，请选择较小的图片');
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();img.src=url;await img.decode();
    const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx) throw new Error('无法处理图片');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  } finally {URL.revokeObjectURL(url);}
}
export const BOOK_LIBRARY:Record<string,{title:string;publisher:string}>= {
  '高等数学':{title:'高等数学',publisher:'高等教育出版社'},'线性代数':{title:'线性代数',publisher:'高等教育出版社'}
};
