const intents={HOLD:'예비대 유지',ADVANCE:'전선 전진',BREAKTHROUGH:'돌파 시도',FLANK:'측면 기동',COUNTERATTACK:'역습',DEFEND:'깃발 방어',REGROUP:'재집결',CAPTURE:'적 깃발 공격'};
const actions={advance:'교전 이동',move:'이동',focus:'집중 공격',fortify:'방어선 구축',hold:'사수',retreat:'후퇴',follow:'아군 합류',rally:'집결'};
export function logDecision(match,kind,id,action,target){
 if(!match)return;
 const log=match.aiLog??={revision:0,entries:[]};
 const label=kind==='plan'?intents[action]:actions[action];if(!label)return;
 const unit=kind==='plan'?`작전 ${id+1}`:`${id}분대`;
 const position=Number.isFinite(target?.x)&&Number.isFinite(target?.y)?` → ${Math.round(target.x)},${Math.round(target.y)}`:'';
 log.entries.push({at:match.elapsed,text:`${unit} · ${label}${position}`});
 if(log.entries.length>24)log.entries.shift();log.revision++;
}
