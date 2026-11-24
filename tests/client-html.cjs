// Returns dist/client/index.html with its stylesheet and scripts inlined, in page order.
// The page loads its JS as separate classic scripts that share one global scope, so the
// scripts are joined into a single <script> block; tests can slice code by marker as before.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','dist','client');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function clientScripts(){
  return [...read('index.html').matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m=>m[1]);
}
function clientHtml(){
  let html=read('index.html');
  html=html.replace(/<link rel="stylesheet" href="\/([^"]+)">/g,(_,p)=>`<style>\n${read(p)}</style>`);
  html=html.replace(/(?:<script src="\/[^"]+"><\/script>\n?)+/,block=>{
    const srcs=[...block.matchAll(/src="\/([^"]+)"/g)].map(m=>m[1]);
    return `<script>\n${srcs.map(read).join('')}</script>\n`;
  });
  return html;
}
module.exports=clientHtml;
module.exports.clientScripts=clientScripts;
module.exports.clientRoot=root;
