"""
Script to migrate all registerEffect() calls from old IDs to new KS-XXX-RARITY IDs.
Also updates ContinuousEffects.ts and defeatUtils.ts references.
"""
import json, sys, os, re, glob

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Build old_id -> new_id mapping from card-data.json
with open('lib/data/card-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

old_to_new = {}
for card_id, card in data['cards'].items():
    old_id = card.get('old_id', '')
    if old_id:
        old_to_new[old_id] = card_id

# Add special mappings that might not be in old_id
# Cards with 'b' suffix (e.g., 113b/130)
old_to_new.setdefault('113b/130', 'KS-113b-R')
old_to_new.setdefault('116b/130', 'KS-116b-R')
old_to_new.setdefault('119b/130', 'KS-119b-R')
old_to_new.setdefault('124b/130', 'KS-124b-R')

# Mission cards
for i in range(1, 11):
    old_to_new.setdefault(f'MSS {str(i).zfill(2)}', f'KS-{str(i).zfill(3)}-MMS')

# Legendary
old_to_new.setdefault('Legendary', 'KS-000-L')

# RART variants (e.g., "108/130 A")
for card_id, card in data['cards'].items():
    if card['rarity'] == 'RART':
        num = card['number']
        old_rart_id = f'{str(num).zfill(3)}/130 A'
        old_to_new.setdefault(old_rart_id, card_id)

# Also map "118/130 A" style
old_to_new.setdefault('118/130 A', 'KS-118-RART')

print(f"ID mapping: {len(old_to_new)} entries")

# Debug: show some mappings
for old, new in sorted(old_to_new.items())[:20]:
    print(f"  {old} -> {new}")
print("  ...")

# ---- Process handler files ----
handler_dirs = [
    'lib/effects/handlers/common',
    'lib/effects/handlers/uncommon',
    'lib/effects/handlers/rare',
    'lib/effects/handlers/secret',
    'lib/effects/handlers/mythos',
    'lib/effects/handlers/legendary',
    'lib/effects/handlers/missions',
]

files_modified = 0
replacements_total = 0

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
        count = [0]

        # Replace registerEffect('OLD_ID', ...) with registerEffect('NEW_ID', ...)
        def replace_register(match):
            old_id = match.group(1)
            if old_id in old_to_new:
                count[0] += 1
                return f"registerEffect('{old_to_new[old_id]}'"
            else:
                print(f"  WARNING: No mapping for '{old_id}' in {fpath}")
                return match.group(0)

        content = re.sub(r"registerEffect\('([^']+)'", replace_register, content)

        if content != original:
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content)
            files_modified += 1
            replacements_total += count[0]

print(f"\nHandler files modified: {files_modified}")
print(f"Total registerEffect replacements: {replacements_total}")

# ---- Process ContinuousEffects.ts ----
ce_path = 'lib/effects/ContinuousEffects.ts'
if os.path.exists(ce_path):
    with open(ce_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    ce_count = [0]

    # Replace topCard.id === 'OLD_ID' with topCard.id === 'NEW_ID'
    def replace_id_check(match):
        old_id = match.group(1)
        if old_id in old_to_new:
            ce_count[0] += 1
            return f"topCard.id === '{old_to_new[old_id]}'"
        return match.group(0)

    content = re.sub(r"topCard\.id === '([^']+)'", replace_id_check, content)

    if content != original:
        with open(ce_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\nContinuousEffects.ts: {ce_count[0]} ID replacements")

# ---- Process defeatUtils.ts ----
du_path = 'lib/effects/defeatUtils.ts'
if os.path.exists(du_path):
    with open(du_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    du_replacements = 0

    # Replace any old ID string references
    for old_id, new_id in old_to_new.items():
        old_pattern = f"'{old_id}'"
        new_pattern = f"'{new_id}'"
        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)
            du_replacements += 1

    if content != original:
        with open(du_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"defeatUtils.ts: {du_replacements} ID replacements")

# ---- Process EffectEngine.ts ----
ee_path = 'lib/effects/EffectEngine.ts'
if os.path.exists(ee_path):
    with open(ee_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for old_id, new_id in old_to_new.items():
        old_pattern = f"'{old_id}'"
        new_pattern = f"'{new_id}'"
        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)

    if content != original:
        with open(ee_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"EffectEngine.ts updated")

# ---- Process EffectRegistry.ts ----
er_path = 'lib/effects/EffectRegistry.ts'
if os.path.exists(er_path):
    with open(er_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for old_id, new_id in old_to_new.items():
        old_pattern = f"'{old_id}'"
        new_pattern = f"'{new_id}'"
        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)

    if content != original:
        with open(er_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"EffectRegistry.ts updated")

# ---- Process effectTranslationsFr.ts ----
et_path = 'lib/data/effectTranslationsFr.ts'
if os.path.exists(et_path):
    with open(et_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    for old_id, new_id in old_to_new.items():
        # Replace both 'old_id' and "old_id" patterns
        content = content.replace(f"'{old_id}'", f"'{new_id}'")
        content = content.replace(f'"{old_id}"', f'"{new_id}"')

    if content != original:
        with open(et_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"effectTranslationsFr.ts updated")

print("\nDone!")
