/** Reproduce isolated deployment policies on an archived baseline; no runtime switches. */
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const repo=resolve(import.meta.dirname,'..'),baseline=process.env.BASELINE||'f6e4f027',temp=mkdtempSync(join(tmpdir(),'flower-deployment-'));
const variants=(process.env.VARIANTS||'baseline,rotation,all-regions,rotation-all,staging-only').split(','),results=[];
function replaceOnce(source,before,after){if(source.split(before).length!==2)throw Error('Baseline patch no longer applies: '+before);return source.replace(before,after);}
try{
 const archive=join(temp,'baseline.tar');execFileSync('git',['archive',baseline,'--format=tar','--output='+archive],{cwd:repo,stdio:'inherit'});
 for(const variant of variants){
  if(!['baseline','rotation','all-regions','rotation-all','staging-only'].includes(variant))throw Error('Unknown variant '+variant);
  const root=join(temp,variant);mkdirSync(root);execFileSync('tar',['-xf',archive,'-C',root],{stdio:'inherit'});
  const path=join(root,'src/ai/controller.mjs');let source=readFileSync(path,'utf8');
  if(['rotation','rotation-all'].includes(variant)){
   source=replaceOnce(source,'  anchors.sort((a,b)=>cost(a)-cost(b));\n','');
   source=replaceOnce(source,'anchor:anchors[0]||','anchor:anchors[index%Math.max(1,anchors.length)]||');
  }
  if(['all-regions','rotation-all'].includes(variant))source=replaceOnce(source,'n.x>=m.board.width*.6',"m.inTerritory('B',n)");
  if(variant==='staging-only')source=replaceOnce(source,'n.x>=m.board.width*.6',"(n.x>=m.board.width*.6||n.kind==='staging'&&m.inTerritory('B',n))");
  writeFileSync(path,source);const output=join(temp,variant+'.json');
  execFileSync(process.execPath,[join(repo,'scripts/benchmark_combat_cohesion.mjs')],{cwd:repo,env:{...process.env,FLOWER_ROOT:root,OUTPUT:output},stdio:'inherit'});
  results.push({variant,baseline,controllerHash:createHash('sha256').update(source).digest('hex'),runs:JSON.parse(readFileSync(output,'utf8'))});
 }
 const text=JSON.stringify(results,null,2)+'\n';if(process.env.OUTPUT)writeFileSync(resolve(process.env.OUTPUT),text);else process.stdout.write(text);
}finally{rmSync(temp,{recursive:true,force:true});}
