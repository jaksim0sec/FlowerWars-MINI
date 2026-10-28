import * as fixture from './fixture-state.mjs';
import * as battle from './battle-state.mjs';
export {createFixture,applyFixtureCommand,stepFixture,SNAPSHOT_VERSION,ADAPTER,MAX_SNAPSHOT_BYTES} from './fixture-state.mjs';
export {createBattleState,stepBattle,saveBattleState,restoreBattleState,validateBattleState,MAX_BATTLE_SNAPSHOT_BYTES} from './battle-state.mjs';
export function saveMatchState(state,sequence){return state?.board instanceof Object?battle.saveBattleState(state,sequence):fixture.saveMatchState(state,sequence);}
export function validateMatchState(snapshot){return snapshot?.adapter==='battle-v1'?battle.validateBattleState(snapshot):fixture.validateMatchState(snapshot);}
export function restoreMatchState(snapshot){return snapshot?.adapter==='battle-v1'?battle.restoreBattleState(snapshot):fixture.restoreMatchState(snapshot);}
export function snapshotMetadata(snapshot){return {version:snapshot.version,adapter:snapshot.adapter,matchId:snapshot.matchId,sequence:snapshot.sequence,hash:snapshot.hash};}
