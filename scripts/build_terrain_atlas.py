"""Package supplied terrain layers without resizing or changing their pixels.

Requires Pillow; run after replacing any assets/world/terrain/*/*.webp tile.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'assets/world/terrain'
LAYERS = ('surface', 'wall_x', 'wall_y')
MATERIALS = ('grass', 'soil', 'pond')
atlas = Image.new('RGBA', (1440, 963))
for layer_index, layer in enumerate(LAYERS):
    for material_index, material in enumerate(MATERIALS):
        for variant in range(1, 11):
            with Image.open(ROOT / layer / f'{material}_{variant:02}.webp') as tile:
                if tile.size != (144, 107):
                    raise ValueError(f'Unexpected tile dimensions: {tile.filename}')
                atlas.paste(tile, ((variant - 1) * 144, (layer_index * 3 + material_index) * 107))
atlas.save(ROOT / 'atlas.webp', lossless=True, method=6)
