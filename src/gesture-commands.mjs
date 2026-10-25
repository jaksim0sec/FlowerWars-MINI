import {squadsFor,squadOf} from './unit-groups.mjs';

/** Translate a single battlefield tap into a tactical intent, without changing
 * unit movement, combat, or camera logic. Only the explicit squad-control mode
 * should call this function. */
export function squadTapIntent(board,squadId,target,tile){
 const selected=squadsFor(board).get(squadId);
 if(!selected)return {kind:'none'};
 if(target?.health?.current>0){
   const other=squadOf(board,target);
   if(target.team&&target.team!==selected.team)
     return {kind:'order',action:'focus',aim:other?{squadId:other.id}:{unitId:target.id}};
   if(target.team===selected.team&&other&&other.id!==selected.id)
     return {kind:'select',squadId:other.id};
   // A unit's visible footprint is not a reliable empty movement tile.
   return {kind:'inspect'};
 }
 if(tile&&board.inside(tile.x,tile.y))
   return {kind:'order',action:'move',aim:{x:tile.x,y:tile.y}};
 return {kind:'none'};
}
