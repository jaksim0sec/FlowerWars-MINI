import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as catalogApi from '../src/characters/catalog.mjs';
import {createCharacter} from '../src/characters/engine.mjs';
const manifest=JSON.parse(await readFile(new URL('../assets/characters.json',import.meta.url)));
test('visible roster hides both legacy heroes while preserving their definitions',()=>{
 assert.equal(typeof catalogApi.visibleCharacters,'function');
 const catalog={characters:manifest.characters},entries=catalogApi.visibleCharacters(catalog),ids=entries.map(([id])=>id);
 assert.deepEqual(ids,['shield-guard','scholar','banner-bearer','clover-mage','archer','scout']);
 for(const id of ['gynari-warrior','sprout-healer']){
  assert.equal(catalog.characters[id].hidden,true);
  assert.equal(createCharacter(catalog,id).characterId,id,'hidden definition was deleted');
 }
});
