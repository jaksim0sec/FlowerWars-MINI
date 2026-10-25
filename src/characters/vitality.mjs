/** Shared health and visual-state timing; independent of board and renderer. */
export const DEATH_DURATION=1.7;
export function createHealth(max=100){return{max,current:max,injury:0,critical:0};}
export function healthLabel(h){return h.current<=0?'사망':h.current/h.max<=.3?'빈사':h.current/h.max<=.6?'부상':'건강';}
export function advanceHealth(h,dt){const r=h.current/h.max,k=1-Math.exp(-dt*7);h.injury+=((r<=.6?1:0)-h.injury)*k;h.critical+=((r<=.3?1:0)-h.critical)*k;}
