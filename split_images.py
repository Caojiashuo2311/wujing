"""
Split composite enemy images into separate top/bottom parts for precise display.
Run once: python split_images.py
"""
import os
from PIL import Image

IMAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'images')

def split_image(filename, splits, names):
    """Split an image vertically into multiple parts.
    splits: list of (start_ratio, end_ratio) tuples
    names: list of output filenames
    """
    path = os.path.join(IMAGE_DIR, filename)
    if not os.path.exists(path):
        print(f"  [SKIP] {filename} not found")
        return
    img = Image.open(path)
    w, h = img.size
    for (start, end), name in zip(splits, names):
        top = int(h * start)
        bottom = int(h * end)
        cropped = img.crop((0, top, w, bottom))
        out_path = os.path.join(IMAGE_DIR, name)
        cropped.save(out_path, quality=90)
        print(f"  [OK] {name} ({cropped.size[0]}x{cropped.size[1]})")

if __name__ == '__main__':
    print("Splitting enemy_dite.jpeg...")
    split_image('enemy_dite.jpeg',
                [(0, 0.45), (0.45, 1.0)],
                ['enemy_dite_top.jpeg', 'enemy_dite_bottom.jpeg'])

    print("Splitting enemy_kongbu_new.jpeg...")
    split_image('enemy_kongbu_new.jpeg',
                [(0, 0.5), (0.5, 1.0)],
                ['enemy_kongbu_top.jpeg', 'enemy_kongbu_bottom.jpeg'])

    print("Splitting enemy_xiejiao.jpeg...")
    split_image('enemy_xiejiao.jpeg',
                [(0, 0.33), (0.33, 0.66), (0.66, 1.0)],
                ['enemy_xiejiao_top.jpeg', 'enemy_xiejiao_mid.jpeg', 'enemy_xiejiao_bottom.jpeg'])

    print("Splitting enemy_naoshi.jpeg...")
    split_image('enemy_naoshi.jpeg',
                [(0, 0.5), (0.5, 1.0)],
                ['enemy_naoshi_top.jpeg', 'enemy_naoshi_bottom.jpeg'])

    print("\nDone! All split images saved to static/images/")
