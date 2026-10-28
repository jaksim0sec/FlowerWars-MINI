"""Compatibility entry point: online E2E now exercises the actual battlefield."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('online-battle-browser.py')),run_name='__main__')
