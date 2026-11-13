/* Browser document import helpers. */
(function(){
'use strict';
window.BGDocumentImport={
  loaded:{},
  loadScript:function(src){
    var self=this;
    if(self.loaded[src])return self.loaded[src];
    self.loaded[src]=new Promise(function(resolve,reject){
      var s=document.createElement('script');s.src=src;s.onload=resolve;
      s.onerror=function(){delete self.loaded[src];s.remove();reject(new Error('Could not load the import library. Check your connection and try again.'));};
      document.head.appendChild(s);
    });
    return self.loaded[src];
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
      for(var i=1;i<=Math.min(pdf.numPages,60);i++){var page=await pdf.getPage(i),content=await page.getTextContent();parts.push(content.items.map(function(x){return x.str;}).join(' '));}
      return {value:parts.join('\n\n')};
    });
  },
  extract:function(file){
    var name=file.name.toLowerCase();
    if(file.size>8*1024*1024)return Promise.reject(new Error('That file is larger than 8 MB. Use a smaller file or paste the text.'));
    if(!/\.(docx|pdf|txt|md|markdown|text)$/.test(name))return Promise.reject(new Error('Unsupported file type. Use .txt, .md, .docx or .pdf.'));
    if(/\.docx$/.test(name))return this.docx(file).then(function(r){return r.value||'';});
    if(/\.pdf$/.test(name))return this.pdf(file).then(function(r){return r.value||'';});
    return this.txt(file);
  }
};
})();
