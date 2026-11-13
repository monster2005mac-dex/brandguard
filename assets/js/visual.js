/* Browser-side image preparation and dominant-color sampling for visual checks. */
(function(){
'use strict';
var BG=window.BG=window.BG||{},MAX_INPUT=10*1024*1024,MAX_DATA_URL=200000;

function loadBitmap(file){
  if(window.createImageBitmap)return createImageBitmap(file);
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){URL.revokeObjectURL(url);resolve(img);};
    img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('The image could not be decoded.'));};
    img.src=url;
  });
}
function toBlob(canvas,quality){
  return new Promise(function(resolve){canvas.toBlob(resolve,'image/jpeg',quality);});
}
function colorsFrom(canvas){
  var sample=document.createElement('canvas'),side=96,ctx;
  sample.width=side;sample.height=side;ctx=sample.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(canvas,0,0,side,side);
  var pixels=ctx.getImageData(0,0,side,side).data,bins={};
  for(var i=0;i<pixels.length;i+=16){
    if(pixels[i+3]<128)continue;
    var r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=[r>>4,g>>4,b>>4].join(',');
    var bin=bins[key]||(bins[key]={count:0,r:0,g:0,b:0});
    bin.count++;bin.r+=r;bin.g+=g;bin.b+=b;
  }
  return Object.keys(bins).sort(function(a,b){return bins[b].count-bins[a].count;}).slice(0,5).map(function(key){
    var x=bins[key],hex=function(n){return Math.round(n/x.count).toString(16).padStart(2,'0');};
    return '#'+hex(x.r)+hex(x.g)+hex(x.b);
  });
}
function dataUrl(blob){
  return new Promise(function(resolve,reject){
    var reader=new FileReader();reader.onload=function(){resolve(String(reader.result));};
    reader.onerror=function(){reject(new Error('The image could not be prepared for saving.'));};
    reader.readAsDataURL(blob);
  });
}
async function digest(text){
  if(!window.crypto||!window.crypto.subtle)throw new Error('Secure browser crypto is required to attach an image. Open the deployed HTTPS site.');
  var bytes=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
async function prepare(file){
  if(!file||!/^image\/(png|jpeg)$/.test(file.type))throw new Error('Choose a PNG or JPG image.');
  if(file.size>MAX_INPUT)throw new Error('Images must be 10 MB or smaller.');
  var bitmap=await loadBitmap(file),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),baseW=Math.max(1,Math.round(bitmap.width*scale)),
    baseH=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),blob=null;
  for(var attempt=0;attempt<10;attempt++){
    var shrink=attempt>=4?Math.pow(0.82,attempt-3):1;
    canvas.width=Math.max(1,Math.round(baseW*shrink));canvas.height=Math.max(1,Math.round(baseH*shrink));
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    blob=await toBlob(canvas,Math.max(0.42,0.84-(attempt%4)*0.12));
    if(blob&&blob.size*4/3<=MAX_DATA_URL)break;
  }
  if(bitmap.close)bitmap.close();
  if(!blob||blob.size*4/3>MAX_DATA_URL)throw new Error('This image is too detailed to safely save. Try a smaller image.');
  var url=await dataUrl(blob);
  return {dataUrl:url,hash:await digest(url),colors:colorsFrom(canvas),width:canvas.width,height:canvas.height,
    mime:'image/jpeg',name:String(file.name||'image').slice(0,120),size:blob.size,alt:'',hasText:false,foreground:'#000000',background:'#FFFFFF'};
}
BG.visual={prepare:prepare,contrastRatio:BG.engine.contrastRatio,colorDistance:BG.engine.colorDistance};
})();
