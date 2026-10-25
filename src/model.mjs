import {combatOptions,inAttackRange,tryAutoAttack,BASE_ATTACK_DURATION} from './combat.mjs';
import {Navigation,NAV_INTERVAL} from './navigation.mjs';
import {createHealth,advanceHealth,DEATH_DURATION} from './characters/vitality.mjs';
export const HALF_W = 72;
export const HALF_H = 42;
export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 16;
export const STEP_TIME = 0.34;
export const IMPACT_TIME = 0.3;

export function project(x, y) {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H };
}

export function unproject(x, y) {
  return { x: (x / HALF_W + y / HALF_H) / 2, y: (y / HALF_H - x / HALF_W) / 2 };
}

export function tileAt(px, py, width, height) {
  const p = unproject(px, py);
  const x = Math.floor(p.x + 0.5), y = Math.floor(p.y + 0.5);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

export function zoomCamera(camera, anchor, factor) {
  const scale = Math.min(2.4, Math.max(0.1, camera.scale * factor));
  const ratio = scale / camera.scale;
  return { x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio, scale };
}

export function fitBoardCamera(width, height, columns = BOARD_COLUMNS, rows = BOARD_ROWS) {
  const left = -rows * HALF_W, right = columns * HALF_W;
  // Leave space above back-row units and below the outer stone sidewalls.
  const top = -126, bottom = (columns + rows - 1) * HALF_H + 22;
  const scale = Math.max(.1, Math.min((width - 32) / (right - left), (height - 32) / (bottom - top), 1.1));
  return { x: width / 2 - (left + right) / 2 * scale,
    y: height / 2 - (top + bottom) / 2 * scale, scale };
}

/** Deterministic command model with optional local test combat; no DOM or victory rules. */
export class Board {
  constructor(width = BOARD_COLUMNS, height = BOARD_ROWS) {
    this.width = width;
    this.height = height;
    this.reset();
  }

  reset() {
    this.terrainRevision=(this.terrainRevision||0)+1;
    this.units = []; this.byId=new Map(); this.cells=new Map(); this.reservations=new Map();
    this.flows={east:0,west:0,south:0,north:0};
    this.obstacles=new Map();this.obstacleRevision=0;this.navClock=0;this.navigation=new Navigation(this);
    this.combatStats={checks:0,probes:0,attacks:0,hits:0};
    this.effects = []; this.nextId = 1; this.time = 0;
    this.terrain = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => (x === 3 || x === 4 || y === 2 && x > 1 && x < 6) ? 'soil' : 'grass'));
  }
  setTerrain(x,y,type) {
    if(!this.inside(x,y)||!['grass','soil'].includes(type))return false;
    if(this.terrain[y][x]!==type){this.terrain[y][x]=type;this.terrainRevision++;}
    return true;
  }
  inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height; }
  unit(id) { return this.byId.get(id); }
  at(x, y) { if(!this.inside(x,y))return undefined;const u=this.unit(this.cells.get(y*this.width+x));return u?.health.current>0?u:undefined; }
  get busy() { return this.units.some(u => u.state !== 'idle' && u.state !== 'death'); }
  occupied(x,y,except=null) {
    const index=y*this.width+x;
    return [this.cells.get(index),this.reservations.get(index)].some(id=>id!=null&&id!==except);
  }
  setObstacle(x,y,info=null) {
    if(!this.inside(x,y)||info?.blocked!==false&&info&&this.occupied(x,y))return false;
    const index=y*this.width+x;
    if(info)this.obstacles.set(index,{...info});else this.obstacles.delete(index);
    this.obstacleRevision++;this.navigation.invalidate();return true;
  }
  cancelCommand(u) { if(u.command?.flow)this.flows[u.command.flow]--;if(u.state==='walk'&&!u.step)u.state='idle';u.command=null;u.target=null;u.guide=[];u.guideKey=null;u.yieldUntil=0;u.route=[];u.path=[];u.waitReason=null;u.retryAt=0;u.waitSince=null; }
  spawn(x, y, character = null, options={}) {
    if (!this.inside(x, y) || this.navigation.blocked(y*this.width+x) || this.occupied(x, y)) return null;
    const health=character?.health||createHealth();
    if(Number.isFinite(options.stats?.maxHealth)&&options.stats.maxHealth>0)health.current=health.max=options.stats.maxHealth;
    const u = { character, health, team:options.team||null,combat:combatOptions(options),strike:null,
      damage:Number.isFinite(options.stats?.damage)&&options.stats.damage>0?options.stats.damage:25, id: this.nextId++, x, y, visualX: x, visualY: y,
      state: 'idle', elapsed: 0, facing: -1, path: [], target: null, command:null, step:null, route:[], waitReason:null, hits: 0, impacted: false };
    this.units.push(u);this.byId.set(u.id,u);this.cells.set(y*this.width+x,u.id);
    return u;
  }

  move(id,x,y) {
    const u=this.unit(id);
    if(!u||u.health.current<=0||u.state!=='idle'||u.step||!this.inside(x,y)||this.navigation.blocked(y*this.width+x)||u.x===x&&u.y===y)return false;
    const field=this.navigation.field(x,y);
    if(field?.complete&&field.at(u.y*this.width+u.x)<0)return false;
    this.cancelCommand(u);const flow=Math.abs(x-u.x)>=Math.abs(y-u.y)?(x>u.x?'east':'west'):(y>u.y?'south':'north');
    u.command={type:'move',x,y,flow};this.flows[flow]++;this.navigation.plan(u);return true;
  }
  attack(id,targetId) {
    const u=this.unit(id),target=this.unit(targetId);
    if(!u||!target||u===target||u.team&&u.team===target.team||u.health.current<=0||target.health.current<=0||u.state!=='idle'||u.step)return false;
    this.cancelCommand(u);u.target=targetId;u.command={type:'attack',target:targetId};this.navigation.plan(u);return true;
  }
  beginStep(u,next) {
    u.state='walk';u.elapsed=0;u.step={...next,elapsed:0};u.path=[next];
    this.reservations.set(next.y*this.width+next.x,u.id);
    u.facing=project(next.x-u.x,next.y-u.y).x>=0?1:-1;
  }

  inAttackRange(u,target,physical=true){return inAttackRange(u,target,physical);}
  tryAutoAttack(u){return tryAutoAttack(this,u);}
  beginAttack(u,targetId=u.target,automatic=false) {
    const target=this.unit(targetId);
    if(!target||target.health.current<=0||u.health.current<=0||u.step||!inAttackRange(u,target,false)||u.team&&u.team===target.team)return false;
    if(this.time+1e-9<u.combat.nextAttackAt)return false;
    u.target=targetId;u.facing=project(target.visualX-u.visualX,target.visualY-u.visualY).x>=0?1:-1;
    u.attackVector=project(target.visualX-u.visualX,target.visualY-u.visualY);
    u.strike={target:targetId,automatic,duration:u.combat.period,impactTime:u.combat.period*IMPACT_TIME/BASE_ATTACK_DURATION};
    u.combat.nextAttackAt=this.time+u.combat.period;
    u.state='attack';u.elapsed=0;u.impacted=false;u.waitReason=null;this.combatStats.attacks++;return true;
  }

  heal(id,amount) {
    const u=this.unit(id);if(!u||u.health.current<=0||!Number.isFinite(amount)||amount<=0)return 0;
    const gain=Math.min(amount,u.health.max-u.health.current);u.health.current+=gain;return gain;
  }
  damage(id,amount,direction=1) {
    const u=this.unit(id);if(!u||u.health.current<=0||!Number.isFinite(amount)||amount<=0)return false;
    u.health.current=Math.max(0,u.health.current-amount);u.hits++;
    const committed=u.state==='attack'&&u.strike&&u.health.current>0;
    const resume=u.combat.auto&&u.team&&u.command?.type==='move'&&u.health.current>0;
    if(!committed){
      if(!resume)this.cancelCommand(u);
      u.elapsed=0;u.state=u.health.current<=0?'death':'hit';u.strike=null;
    }
    u.deathDirection=direction;
    if(u.health.current<=0){this.cells.delete(u.y*this.width+u.x);if(u.step)this.reservations.delete(u.step.y*this.width+u.step.x);u.step=null;}
    return true;
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    // Bound event integration, keeping impacts/arrivals consistent for large dt.
    while(dt>1e-9){const slice=Math.min(dt,.05);this.advance(slice);dt-=slice;}
  }
  advance(dt) {
    this.time+=dt;
    for(const e of this.effects)e.age+=dt;
    this.effects=this.effects.filter(e=>e.age<.55);
    for(const u of this.units){u.elapsed+=dt;advanceHealth(u.health,dt);}
    // Commit all arrivals before reserving departures: order cannot cause swaps.
    for(const u of this.units)if(u.step) {
      const p=u.step;p.elapsed+=dt;
      if(p.elapsed+1e-9>=STEP_TIME) {
        this.cells.delete(u.y*this.width+u.x);this.reservations.delete(p.y*this.width+p.x);
        u.x=p.x;u.y=p.y;u.visualX=u.x;u.visualY=u.y;this.cells.set(u.y*this.width+u.x,u.id);
        u.step=null;u.path=[];
        if(u.state==='walk'){u.state=u.command?'walk':'idle';u.elapsed=0;}
        this.movementPolicy?.onArrive?.({board:this,unit:u,at:{x:u.x,y:u.y}});
        if(u.command?.type==='move'&&u.x===u.command.x&&u.y===u.command.y){this.cancelCommand(u);if(u.state==='walk')u.state='idle';}
      } else {
        const t=p.elapsed/STEP_TIME;u.visualX=u.x+(p.x-u.x)*t;u.visualY=u.y+(p.y-u.y)*t;
      }
    }
    // Commit same-slice strikes before applying damage: neither actor order nor
    // a lethal first entry suppresses the opponent's already committed impact.
    const impacts=[];
    for(const u of this.units) {
      if(u.state==='attack'&&u.strike) {
        const strike=u.strike;
        if(!u.impacted&&u.elapsed+1e-9>=strike.impactTime) {
          u.impacted=true;const target=this.unit(strike.target);
          if(target&&target.health.current>0&&inAttackRange(u,target)) {
            impacts.push({target,damage:u.damage,direction:project(target.visualX-u.visualX,target.visualY-u.visualY).x>=0?1:-1});
          }
        }
        if(u.elapsed+1e-9>=strike.duration){
          u.strike=null;u.elapsed=0;
          if(strike.automatic){u.target=null;u.state=u.command?'walk':'idle';}
          else {u.state='idle';this.cancelCommand(u);}
        }
      } else if(u.state==='hit'&&u.elapsed>=.36){u.state=u.command?'walk':'idle';u.elapsed=0;}
    }
    for(const {target,damage,direction} of impacts)if(this.damage(target.id,damage,direction)){
      this.effects.push({x:target.visualX,y:target.visualY,age:0});this.combatStats.hits++;
    }
    this.navClock+=dt;
    if(this.navClock+1e-9>=NAV_INTERVAL) {
      this.navClock%=NAV_INTERVAL;this.navigation.refill();this.navigation.schedule();
    }
    this.units=this.units.filter(u=>{
      if(u.state!=='death'||u.elapsed<DEATH_DURATION)return true;
      this.byId.delete(u.id);return false;
    });
  }
}
