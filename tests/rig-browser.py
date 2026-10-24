"""Pixel regressions for the ornament seam and trimmed free wrist."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE_URL', 'http://127.0.0.1:8000')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'), args=['--no-sandbox'])
    page = browser.new_page()
    page.goto(BASE)
    failures = page.evaluate('''async () => {
        const {loadArtwork, drawWarrior} = await import('/src/render.mjs');
        const art = await loadArtwork();
        art.rig.scale = .8;
        const failures = [];
        const canvas = () => {
            const c = document.createElement('canvas'); c.width = 1400; c.height = 1400;
            return c.getContext('2d');
        };
        const transparent = document.createElement('canvas');
        transparent.width = transparent.height = 1;
        // The source asset itself must be clean, including when reused without
        // the runtime mask. These are the two reported outline remnants.
        const source = document.createElement('canvas');
        source.width = 134; source.height = 155;
        const sourceCtx = source.getContext('2d');
        sourceCtx.drawImage(art.parts.hand_front, 0, 0);
        for (const [x, y] of [[33, 78], [85, 50]]) {
            if (sourceCtx.getImageData(x, y, 1, 1).data[3] > 10)
                failures.push(`source asset: untrimmed wrist outline at ${x},${y}`);
        }
        const wristImages=Object.fromEntries(Object.keys(art.parts).map(name => [name,name==='hand_front'?art.parts[name]:transparent]));
        const wristArt={...art,catalog:{...art.catalog,equipment:Object.fromEntries(Object.entries(art.catalog.equipment).map(([id,e])=>[id,{...e,image:transparent}])),characters:{...art.catalog.characters,'gynari-warrior':{...art.catalog.characters['gynari-warrior'],images:wristImages}}}};
        const alpha = (ctx, point) => ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data[3];
        for (const facing of [-1, 1]) for (const state of ['idle', 'walk', 'attack', 'hit']) {
            for (const elapsed of [0, .1, .2, .3]) {
                const label = `${facing}/${state}/${elapsed}`;
                const unit = {id: 1, state, facing, elapsed, attackVector: {x: facing * 72, y: 42}};
                const ctx = canvas(), draws = new Map();
                const drawImage = ctx.drawImage.bind(ctx);
                ctx.drawImage = (image, ...args) => {
                    for (const name of ['head', 'head_deco', 'hand_front']) {
                        if (image === art.parts[name]) draws.set(name, {matrix: ctx.getTransform(), args});
                    }
                    drawImage(image, ...args);
                };
                ctx.translate(700, 1250);
                drawWarrior(ctx, art, unit, elapsed);
                const point = (name, x, y) => {
                    const {matrix, args: [dx, dy, w, h]} = draws.get(name);
                    const image = art.parts[name];
                    return matrix.transformPoint({x: dx + x / image.width * w, y: dy + y / image.height * h});
                };
                // These original ornament pixels follow the underside of the small
                // rear petal at the reported gap; the face must overlap this seam.
                const head = canvas(), headDraw = draws.get('head');
                head.setTransform(headDraw.matrix);
                head.drawImage(art.parts.head, ...headDraw.args);
                for (const [x, y] of [[40, 94], [42, 92], [44, 90], [46, 88]]) {
                    if (alpha(head, point('head_deco', x, y)) < 150)
                        failures.push(`${label}: ornament has a gap at ${x},${y}`);
                }
                // Render the actual wrist alone: hidden remnants must be gone from
                // its silhouette, rather than merely covered by another body part.
                const wrist = canvas(); wrist.translate(700, 1250);
                drawWarrior(wrist, wristArt, unit, elapsed);
                for (const [x, y] of [[33, 78], [85, 50]]) {
                    if (alpha(wrist, point('hand_front', x, y)) > 10)
                        failures.push(`${label}: untrimmed wrist outline at ${x},${y}`);
                }
                for (const [x, y] of [[75, 85], [95, 115]]) {
                    if (alpha(wrist, point('hand_front', x, y)) < 200)
                        failures.push(`${label}: cuff or palm was cut away at ${x},${y}`);
                }
            }
        }
        return failures;
    }''')
    browser.close()
    assert not failures, '\n'.join(failures[:12]) + f'\n{len(failures)} pixel failures'
    print('PASS rig pixels: ornament attached and wrist remnants removed in both facings and all four states')
