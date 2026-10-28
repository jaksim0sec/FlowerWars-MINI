"""Run real 700-unit combat/encoding scenarios serially at the same seeds."""
import subprocess,os,json
from pathlib import Path
root=Path(__file__).resolve().parents[1];before=Path(os.environ['BASELINE_ROOT']);out=root/'docs/measurements/autumn-combat-700.json';results={}
for label,repo in [('before',before),('after',root)]:
 results[label]=[]
 for seed in [7,29,73]:
  env={**os.environ,'DURATION':'60','SEED':str(seed)}
  r=subprocess.run(['node','scripts/benchmark_online_battle.mjs'],cwd=repo,env=env,capture_output=True,text=True,check=True)
  results[label].append(json.loads(r.stdout));out.write_text(json.dumps(results,indent=2)+'\n');print(label,seed,'done',flush=True)
