"""Regenerate the versioned offline bundle after runtime/asset changes."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
paths=[ROOT/name for name in ['index.html','characters.html','rig-editor.html','manifest.json']]
for folder in ['src','assets']:
 paths.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in {'.mjs','.css','.json','.png','.webp','.svg','.jpg','.jpeg'})
paths=sorted(paths);template=(ROOT/'scripts/service-worker.template.js').read_text();digest=hashlib.sha256(template.encode())
for p in paths:digest.update(p.relative_to(ROOT).as_posix().encode()+b'\0'+p.read_bytes())
urls=['./']+['./'+p.relative_to(ROOT).as_posix() for p in paths]
worker=template.replace('__VERSION__',json.dumps(digest.hexdigest()[:16])).replace('__ASSETS__',json.dumps(urls,ensure_ascii=False,indent=2))
(ROOT/'sw.js').write_text(worker)
print(f'Offline bundle: {len(urls)} URLs, version {digest.hexdigest()[:16]}')
