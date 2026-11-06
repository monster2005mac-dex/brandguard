/* Browser document import helpers. */
(function(){
'use strict';
window.BGDocumentImport={
  loadScript:function(src){
    return new Promise(function(resolve,reject){
      var s=document.querySelector('script[src="'+src+'"]');
      if(s){s.addEventListener('load',resolve,{once:true});return;}
      s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=function(){reject(new Error('Could not load '+src));};
      document.head.appendChild(s);
    });
  },
  txt:function(file){return file.text();},
  docx:function(file){
    var base='https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
    return this.loadScript(base).then(function(){return file.arrayBuffer().then(function(buffer){return window.mammoth.extractRawText({arrayBuffer:buffer});});});
  },
  pdf:function(file){
    var base='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
    return import(base).then(function(pdfjs){
      pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      return file.arrayBuffer().then(function(buffer){return pdfjs.getDocument({data:new Uint8Array(buffer)}).promise;});
    }).then(async function(pdf){
      var parts=[];
      for(var i=1;i<=pdf.numPages;i++){var page=await pdf.getPage(i),content=await page.getTextContent();parts.push(content.items.map(function(x){return x.str;}).join(' '));}
      return {value:parts.join('\n\n')};
    });
  },
  extract:function(file){
    var name=file.name.toLowerCase();
    if(/\.docx$/.test(name))return this.docx(file).then(function(r){return r.value||'';});
    if(/\.pdf$/.test(name))return this.pdf(file).then(function(r){return r.value||'';});
    return this.txt(file);
  }
};
})();
