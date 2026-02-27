"""
Script to rename card images to {cardId}.webp format.
- Moves all card images to public/images/cards/
- Renames them by their card-data.json ID
- Detects and removes duplicates
- Updates image_file and image_url in card-data.json
"""
import json, sys, os, shutil, hashlib

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open('lib/data/card-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cards = data['cards']

# Create target directory
target_dir = 'public/images/cards'
os.makedirs(target_dir, exist_ok=True)

# Build mapping: current image_file -> card_id
image_to_cards = {}  # normalized image path -> list of card IDs
for card_id, card in cards.items():
    img = card.get('image_file', '')
    if not img:
        continue
    # Normalize path
    img_normalized = img.replace('\\', '/').lstrip('/')
    if img_normalized not in image_to_cards:
        image_to_cards[img_normalized] = []
    image_to_cards[img_normalized].append(card_id)

print(f"Cards with image_file: {sum(len(v) for v in image_to_cards.values())}")
print(f"Unique image files referenced: {len(image_to_cards)}")

# Check for images that map to multiple cards (RART sharing with R etc.)
shared = {k: v for k, v in image_to_cards.items() if len(v) > 1}
if shared:
    print(f"\nShared images ({len(shared)}):")
    for img, cids in shared.items():
        print(f"  {img} -> {cids}")

# Process: rename and move
renamed = 0
skipped = 0
missing = 0
duplicates_removed = 0
seen_hashes = {}  # hash -> first card_id that used this image

for img_path, card_ids in image_to_cards.items():
    # Source file
    src = os.path.join('public', img_path)
    if not os.path.exists(src):
        print(f"  MISSING: {src}")
        missing += 1
        # Still update the JSON paths
        for cid in card_ids:
            cards[cid]['image_file'] = f'images/cards/{cid}.webp'
            cards[cid]['image_url'] = f'/images/cards/{cid}.webp'
        continue

    # Hash the file to detect true duplicates
    with open(src, 'rb') as f:
        file_hash = hashlib.md5(f.read()).hexdigest()

    for i, cid in enumerate(card_ids):
        dst = os.path.join(target_dir, f'{cid}.webp')

        if i == 0:
            # First card using this image: copy
            if file_hash in seen_hashes:
                # This exact file was already copied for another card - just copy again
                shutil.copy2(src, dst)
            else:
                shutil.copy2(src, dst)
                seen_hashes[file_hash] = cid
        else:
            # Additional cards sharing the same image: copy under their own name
            shutil.copy2(src, dst)

        cards[cid]['image_file'] = f'images/cards/{cid}.webp'
        cards[cid]['image_url'] = f'/images/cards/{cid}.webp'
        renamed += 1

print(f"\nRenamed/copied: {renamed}")
print(f"Missing source files: {missing}")

# Now find and report orphan images (in old rarity folders, not referenced by any card)
old_dirs = ['common', 'uncommon', 'rare', 'rare_art', 'secret', 'mythos', 'legendary', 'mission']
orphans = []
for d in old_dirs:
    dir_path = os.path.join('public/images', d)
    if not os.path.isdir(dir_path):
        continue
    for f in os.listdir(dir_path):
        if not f.endswith('.webp'):
            continue
        rel = f'images/{d}/{f}'
        if rel not in image_to_cards:
            orphans.append(rel)

if orphans:
    print(f"\nOrphan images (not referenced by any card): {len(orphans)}")
    for o in orphans:
        print(f"  {o}")
        # Try to match orphans to cards by filename pattern
        # e.g., "images/uncommon/002-130_HIRUZEN_SARUTOBI.webp" -> card 002 UC
        basename = os.path.basename(o).replace('.webp', '')
        # Copy orphans too if we can match them
        parts = basename.split('-')
        if len(parts) >= 2 and parts[0].isdigit():
            num = parts[0]
            # Determine rarity from directory
            dir_rarity = {
                'common': 'C', 'uncommon': 'UC', 'rare': 'R',
                'rare_art': 'RART', 'secret': 'S', 'mythos': 'M',
                'legendary': 'L', 'mission': 'MMS'
            }
            folder = o.split('/')[1]
            rar = dir_rarity.get(folder, '')
            potential_id = f'KS-{num.zfill(3)}-{rar}'

            # Check for special naming patterns
            if '_A_' in basename or basename.endswith('_A'):
                potential_id = f'KS-{num.zfill(3)}-RART'
            elif '_R_' in basename:
                potential_id = f'KS-{num.zfill(3)}-R'

            if potential_id in cards:
                src = os.path.join('public', o)
                dst = os.path.join(target_dir, f'{potential_id}.webp')
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
                    cards[potential_id]['image_file'] = f'images/cards/{potential_id}.webp'
                    cards[potential_id]['image_url'] = f'/images/cards/{potential_id}.webp'
                    if not cards[potential_id].get('has_visual'):
                        cards[potential_id]['has_visual'] = True
                    print(f"    -> Matched and copied as {potential_id}.webp")
                    renamed += 1

# Delete old rarity directories (they should be empty or have been fully copied)
for d in old_dirs:
    dir_path = os.path.join('public/images', d)
    if os.path.isdir(dir_path):
        shutil.rmtree(dir_path)
        print(f"Removed old directory: {dir_path}")

# Write updated JSON
with open('lib/data/card-data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

# Final stats
total_images = len([f for f in os.listdir(target_dir) if f.endswith('.webp')])
print(f"\nFinal image count in {target_dir}: {total_images}")
print(f"Total cards with image_file set: {sum(1 for c in cards.values() if c.get('image_file'))}")
