"""
Script to migrate remaining old IDs in test files, handler comments, and other files.
"""
import json, sys, os, re, glob

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open('lib/data/card-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

old_to_new = {}
for card_id, card in data['cards'].items():
    old_id = card.get('old_id', '')
    if old_id:
        old_to_new[old_id] = card_id

old_to_new.setdefault('113b/130', 'KS-113b-R')
old_to_new.setdefault('116b/130', 'KS-116b-R')
old_to_new.setdefault('119b/130', 'KS-119b-R')
old_to_new.setdefault('124b/130', 'KS-124b-R')
for i in range(1, 11):
    old_to_new.setdefault(f'MSS {str(i).zfill(2)}', f'KS-{str(i).zfill(3)}-MMS')
old_to_new.setdefault('Legendary', 'KS-000-L')
for card_id, card in data['cards'].items():
    if card['rarity'] == 'RART':
        num = card['number']
        old_to_new.setdefault(f'{str(num).zfill(3)}/130 A', card_id)

print(f"Mapping: {len(old_to_new)} entries")

# ---- Process test files ----
test_files = glob.glob('lib/__tests__/*.ts') + glob.glob('lib/__tests__/*.tsx')
total = 0
for fpath in sorted(test_files):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    count = 0
    # Sort by length descending to avoid partial matches
    for old_id, new_id in sorted(old_to_new.items(), key=lambda x: -len(x[0])):
        for q in ["'", '"']:
            old_pat = f'{q}{old_id}{q}'
            new_pat = f'{q}{new_id}{q}'
            if old_pat in content:
                content = content.replace(old_pat, new_pat)
                count += 1
    if content != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  {fpath}: {count} replacements")
        total += count

    # Check for unmapped old IDs still remaining
    remaining = re.findall(r"'(\d{3}/130(?:\s*[A-Z])?)'", content)
    if remaining:
        print(f"  {fpath}: UNMAPPED IDs still present: {set(remaining)}")

print(f"\nTotal test file replacements: {total}")

# ---- Process handler comments (old IDs in comments like "// 001/130 - Name") ----
# These aren't functional but let's update them for consistency
handler_dirs = [
    'lib/effects/handlers/common',
    'lib/effects/handlers/uncommon',
    'lib/effects/handlers/rare',
    'lib/effects/handlers/secret',
    'lib/effects/handlers/mythos',
    'lib/effects/handlers/legendary',
    'lib/effects/handlers/missions',
]

handler_total = 0
for hdir in handler_dirs:
    if not os.path.isdir(hdir):
        continue
    for fname in sorted(os.listdir(hdir)):
        if not fname.endswith('.ts') or fname == 'index.ts':
            continue
        fpath = os.path.join(hdir, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
        original = content
        # Replace old IDs in string literals and comments
        for old_id, new_id in sorted(old_to_new.items(), key=lambda x: -len(x[0])):
            for q in ["'", '"']:
                old_pat = f'{q}{old_id}{q}'
                new_pat = f'{q}{new_id}{q}'
                if old_pat in content:
                    content = content.replace(old_pat, new_pat)
        if content != original:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content)
            handler_total += 1

print(f"Handler files with remaining ID fixes: {handler_total}")

print("\nDone!")
