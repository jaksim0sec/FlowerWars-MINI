// Shared rounded, monochrome icons for orders, unit roles and controls.
const paths={
 move:'M4 12h15m-6-6 6 6-6 6',advance:'M4 12h15m-6-6 6 6-6 6M4 5v2m0 10v2',focus:'M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M8 12h8m-4-4v8',
 flank:'M4 19V8a4 4 0 0 1 4-4h11m-5 5 5-5-5-3',fortify:'M4 20V7h4v4h3V7h3v4h3V7h3v13M3 20h18M9 20v-5h6v5',retreat:'M20 18v-5a5 5 0 0 0-5-5H4m5-5L4 8l5 5',hold:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z',wait:'M8 5v14M16 5v14',rally:'M5 21V3m0 1h13l-3 4 3 4H5',follow:'M3 16h10m-4-4 4 4-4 4M9 7h12m-4-4 4 4-4 4',
 'firing-line':'M3 8h18M5 5v6m7-6v6m7-6v6M5 17h14m-7-3v6',
 assault:'M5 19 19 5m-7 0h7v7M4 14l6 6',defense:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z',ranged:'M6 3c14 4 14 14 0 18M6 3v18m0-9h15m-4-4 4 4-4 4',mobile:'m13 3-8 10h7l-1 8 8-11h-7Z',support:'M9 4h6v5h5v6h-5v5H9v-5H4V9h5Z',mixed:'M5 5h5v5H5Zm9 0h5v5h-5ZM5 14h5v5H5Zm9 0h5v5h-5Z',
 platoon:'m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',options:'M4 7h16M4 17h16M9 4v6m6 4v6',chevron:'m8 5 7 7-7 7',line:'M4 6h16M4 12h16M4 18h16',column:'M8 4v16M16 4v16',dense:'M5 5h5v5H5Zm9 0h5v5h-5ZM5 14h5v5H5Zm9 0h5v5h-5Z',spread:'M4 4h2v2H4Zm14 0h2v2h-2ZM4 18h2v2H4Zm14 0h2v2h-2Z',aggressive:'m5 19 14-14m-7 0h7v7',balanced:'M12 3v18M4 7h16M4 7l-3 7h6Zm16 0-3 7h6Z',avoid:'M4 12h16M9 7l-5 5 5 5',zoom:'M5 12h14',fit:'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5',debug:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2'
};
export function icon(name){
 const grids={line:[[3,8],[7.5,8],[12,8],[16.5,8],[21,8],[3,15],[7.5,15],[12,15],[16.5,15],[21,15]],column:[[8,3],[15,3],[8,7.5],[15,7.5],[8,12],[15,12],[8,16.5],[15,16.5],[8,21],[15,21]],square:[[4,4],[9,4],[15,4],[20,4],[4,9],[20,9],[4,15],[20,15],[4,20],[9,20],[15,20],[20,20]],spread:[[4,4],[20,4],[12,12],[4,20],[20,20]]};
 const commands={advance:paths.move,focus:'M5 3l14 16m-3-1 4-4M4 14l6 6M19 3 5 17M4 3l1 5 3-3Zm16 0-1 5-3-3Z',hold:paths.hold,rally:'M12 16V3m0 1h8l-2 3 2 3h-8M4 20l5-3m11 3-5-3M12 21v-2'};
 const content=grids[name]?grids[name].map(([x,y])=>`<rect x="${x-1.5}" y="${y-1.5}" width="3" height="3" rx="1.2" fill="currentColor" stroke="none"/>`).join(''):`<path d="${commands[name]||paths[name]||paths.hold}"/>`;
 return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
export const typeLabels={assault:'돌격',defense:'철벽',ranged:'궁병',mobile:'기동',support:'지원',mixed:'보병'};
