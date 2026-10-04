import type {BackgroundImage} from './model';
export async function prepareBackground(file:File):Promise<BackgroundImage>{
  if(!/\.(jpe?g|png|webp)$/i.test(file.name)||file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片；暂不支持 GIF、SVG 和 HEIC。');
  if(file.size>10*1024*1024)throw new Error('图片超过 10 MB，请缩小或压缩后再选择。');
  if(!file.size)throw new Error('这张图片是空文件，请重新选择。');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)throw new Error('图片尺寸过大或无效，请使用约 1080×1920 的竖图。');
    const ratio=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const context=canvas.getContext('2d');if(!context)throw new Error('当前设备暂时无法处理这张图片。');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    let encoded=canvas.toDataURL('image/webp',.86);
    if(encoded.length>3_000_000)encoded=canvas.toDataURL('image/jpeg',.82);
    if(encoded.length>3_000_000)throw new Error('处理后的图片仍过大，请改用更小的图片。');
    return {url:encoded,name:file.name,width:canvas.width,height:canvas.height,sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight};
  }catch(error){if(error instanceof Error&&error.name!=='EncodingError')throw error;throw new Error('无法读取这张图片，请确认文件完整或换一张图片。');}
  finally{URL.revokeObjectURL(url);}
}
