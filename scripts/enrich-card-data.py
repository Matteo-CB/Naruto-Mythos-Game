"""
Script to enrich card-data.json with:
1. Corrections from the old cardLoader.ts (effects, keywords, names, stats)
2. Data merged from naruto_mythos_tcg_complete.json
3. Mission data from missions.json
4. RART card data copied from R equivalents
5. Default values for remaining incomplete cards
6. old_id mapping field
"""
import json, sys, copy, os

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open('lib/data/naruto_mythos_tcg_complete.json', 'r', encoding='utf-8') as f:
    old_cards = json.load(f)
with open('lib/data/missions.json', 'r', encoding='utf-8') as f:
    missions_data = json.load(f)
with open('lib/data/card-data.json', 'r', encoding='utf-8') as f:
    new_data = json.load(f)

cards = new_data['cards']

# ---- Build old_id -> new_id mapping ----
rarity_map_rev = {
    'C': 'C', 'UC': 'UC', 'R': 'R', 'RA': 'RART',
    'S': 'S', 'SV': 'SV', 'M': 'M', 'Legendary': 'L', 'Mission': 'MMS'
}

old_to_new = {}
for o in old_cards:
    num = o['number']
    rar = rarity_map_rev.get(o.get('rarity', ''), o.get('rarity', ''))
    # Handle special IDs like "108/130 A" -> RART
    if o['id'].endswith(' A'):
        rar = 'RART'
    if o['id'] == 'Legendary':
        nid = 'KS-000-L'
    elif 'b/' in o['id']:
        # Cards like "113b/130" -> keep the 'b'
        base = o['id'].split('/')[0]
        nid = f'KS-{base}-R'
    else:
        nid = f'KS-{str(num).zfill(3)}-{rar}'
    old_to_new[o['id']] = nid

# Map missions
for m in missions_data:
    num = m.get('number', 0)
    nid = f'KS-{str(num).zfill(3)}-MMS'
    old_to_new[m['id']] = nid

print("Old->New ID mapping built:", len(old_to_new), "entries")

# ---- CORRECTIONS from cardLoader.ts ----
effect_corrections = {
    'Legendary': [
        {'type': 'MAIN', 'description': 'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Instead, defeat both of them.', 'description_fr': ''},
    ],
    '137/130': [
        {'type': 'UPGRADE', 'description': 'Move this character.', 'description_fr': ''},
        {'type': 'MAIN', 'description': 'Hide an upgraded character in this mission.', 'description_fr': ''},
    ],
    '120/130': [
        {'type': 'MAIN', 'description': 'Defeat up to 1 enemy character with Power 1 or less in every mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'POWERUP X, where X is the number of characters defeated by the MAIN effect.', 'description_fr': ''},
    ],
    '120/130 A': [
        {'type': 'MAIN', 'description': 'Defeat up to 1 enemy character with Power 1 or less in every mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'POWERUP X, where X is the number of characters defeated by the MAIN effect.', 'description_fr': ''},
    ],
    '108/130': [
        {'type': 'MAIN', 'description': 'Hide an enemy character with Power 3 or less in this mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.', 'description_fr': ''},
    ],
    '108/130 A': [
        {'type': 'MAIN', 'description': 'Hide an enemy character with Power 3 or less in this mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Powerup X where X is the Power of the enemy character that is being hidden.', 'description_fr': ''},
    ],
    '109/130': [
        {'type': 'MAIN', 'description': "Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.", 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Instead, play the card paying 2 less.', 'description_fr': ''},
    ],
    '133/130': [
        {'type': 'MAIN', 'description': 'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Instead, defeat both of them.', 'description_fr': ''},
    ],
    '135/130': [
        {'type': 'MAIN', 'description': 'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: Instead, play the card paying 4 less.', 'description_fr': ''},
    ],
    '112/130': [
        {'type': 'MAIN', 'description': 'Discard a card from your hand. POWERUP X where X is the cost of the discarded card.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'Repeat the MAIN effect.', 'description_fr': ''},
    ],
    '110/130': [
        {'type': 'MAIN', 'description': 'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: After moving, hide the enemy character.', 'description_fr': ''},
    ],
    '110/130 A': [
        {'type': 'MAIN', 'description': 'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.', 'description_fr': ''},
        {'type': 'UPGRADE', 'description': 'MAIN effect: After moving, hide the enemy character.', 'description_fr': ''},
    ],
}

keyword_corrections = {
    'Legendary': ['Team 7', 'Jutsu'],
    '044/130': ['Academy'],
    '048/130': [],
    '036/130': ['Team Guy', 'Taijutsu'],
    '039/130': ['Team Guy', 'Jutsu'],
    '050/130': ['Sannin', 'Team Dosu'],
    '108/130': ['Team 7', 'Jutsu'],
    '108/130 A': ['Team 7', 'Jutsu'],
    '137/130': ['Team 7', 'Jutsu'],
    '075/130': ['Team Baki', 'Jutsu'],
    '120/130': ['Team Baki', 'Jutsu'],
    '120/130 A': ['Team Baki', 'Jutsu'],
    '133/130': ['Team 7', 'Jutsu'],
    '136/130': ['Team 7', 'Jutsu'],
    '112/130': ['Team 10'],
    '110/130': ['Team 10', 'Jutsu'],
    '110/130 A': ['Team 10', 'Jutsu'],
    '135/130': ['Team 7'],
}

name_corrections = {
    '047/130': 'IRUKA UMINO',
    '034/130': 'KURENAI YUHI',
    '100/130': 'NINJA HOUND CORPS',
}

stat_corrections = {
    'Legendary': {'chakra': 6, 'power': 6, 'group': 'Leaf Village'},
    '108/130': {'chakra': 5, 'power': 5, 'title_fr': 'Believe it!'},
    '108/130 A': {'chakra': 5, 'power': 5, 'title_fr': 'Believe it!'},
    '109/130': {'chakra': 4, 'power': 3, 'title_fr': 'Ninja Medical', 'group': 'Leaf Village'},
    '112/130': {'chakra': 5, 'power': 4, 'group': 'Leaf Village'},
    '110/130': {'chakra': 5, 'power': 4, 'group': 'Leaf Village'},
    '110/130 A': {'chakra': 5, 'power': 4, 'group': 'Leaf Village'},
}

mission_base_points = {
    'MSS 01': 1, 'MSS 02': 1, 'MSS 03': 1, 'MSS 04': 1, 'MSS 05': 1,
    'MSS 06': 1, 'MSS 07': 1, 'MSS 08': 1, 'MSS 09': 1, 'MSS 10': 1,
}

# ---- Step 1: Apply corrections from cardLoader ----
applied = 0
for old_id, new_id in old_to_new.items():
    if new_id not in cards:
        continue
    card = cards[new_id]

    if old_id in effect_corrections:
        card['effects'] = effect_corrections[old_id]
        applied += 1

    if old_id in keyword_corrections:
        card['keywords'] = keyword_corrections[old_id]

    if old_id in name_corrections:
        card['name_fr'] = name_corrections[old_id]

    if old_id in stat_corrections:
        sc = stat_corrections[old_id]
        for key in ('chakra', 'power', 'title_fr', 'group'):
            if key in sc:
                card[key] = sc[key]

print(f'Step 1 - Applied effect corrections: {applied}')

# ---- Step 2: Merge data from old JSON ----
merged = 0
for o in old_cards:
    new_id = old_to_new.get(o['id'])
    if not new_id or new_id not in cards:
        continue
    card = cards[new_id]

    if (card.get('chakra') == '' or card.get('chakra') is None) and isinstance(o.get('chakra'), (int, float)):
        card['chakra'] = o['chakra']
        merged += 1
    if (card.get('power') == '' or card.get('power') is None) and isinstance(o.get('power'), (int, float)):
        card['power'] = o['power']
        merged += 1
    if len(card.get('effects', [])) == 0 and o.get('effects') and len(o['effects']) > 0:
        card['effects'] = [{'type': e['type'], 'description': e['description'], 'description_fr': ''} for e in o['effects']]
        merged += 1
    if len(card.get('keywords', [])) == 0 and o.get('keywords') and len(o['keywords']) > 0:
        card['keywords'] = list(o['keywords'])
        merged += 1
    if (not card.get('group') or card['group'] == '') and o.get('group'):
        card['group'] = o['group']
        merged += 1

print(f'Step 2 - Merged fields from old JSON: {merged}')

# ---- Step 3: Merge mission data ----
for m in missions_data:
    new_id = old_to_new.get(m['id'])
    if not new_id or new_id not in cards:
        continue
    card = cards[new_id]

    if len(card.get('effects', [])) == 0 and m.get('effects') and len(m['effects']) > 0:
        card['effects'] = [{'type': e['type'], 'description': e['description'], 'description_fr': ''} for e in m['effects']]

    old_mission_id = m['id']
    card['basePoints'] = mission_base_points.get(old_mission_id, 1)

    if m.get('name_en') and not card.get('name_en'):
        card['name_en'] = m['name_en']

print('Step 3 - Mission data merged')

# ---- Step 4: Copy R data to RART ----
rart_filled = 0
for card_id, card in list(cards.items()):
    if card['rarity'] != 'RART':
        continue
    r_id = card_id.replace('-RART', '-R')
    if r_id not in cards:
        continue
    r_card = cards[r_id]

    if (card.get('chakra') == '' or card.get('chakra') is None or card.get('chakra') == 0):
        if r_card.get('chakra') and r_card['chakra'] != '' and r_card['chakra'] != 0:
            card['chakra'] = r_card['chakra']
            rart_filled += 1
    if (card.get('power') == '' or card.get('power') is None or card.get('power') == 0):
        if r_card.get('power') and r_card['power'] != '' and r_card['power'] != 0:
            card['power'] = r_card['power']
            rart_filled += 1
    if len(card.get('effects', [])) == 0 and len(r_card.get('effects', [])) > 0:
        card['effects'] = copy.deepcopy(r_card['effects'])
        rart_filled += 1
    if len(card.get('keywords', [])) == 0 and len(r_card.get('keywords', [])) > 0:
        card['keywords'] = list(r_card['keywords'])
        rart_filled += 1
    if (not card.get('group') or card['group'] == '') and r_card.get('group'):
        card['group'] = r_card['group']
        rart_filled += 1
    card['is_rare_art'] = True

print(f'Step 4 - RART fields filled from R: {rart_filled}')

# ---- Step 5: Set defaults ----
incomplete = 0
for card_id, card in cards.items():
    if card['card_type'] == 'mission':
        if 'basePoints' not in card:
            card['basePoints'] = 1
        card['data_complete'] = True
        continue

    is_complete = True
    if card.get('chakra') == '' or card.get('chakra') is None:
        card['chakra'] = 0
        is_complete = False
    if card.get('power') == '' or card.get('power') is None:
        card['power'] = 0
        is_complete = False
    if len(card.get('effects', [])) == 0:
        is_complete = False
    if not card.get('group') or card['group'] == '':
        card['group'] = 'Independent'
        is_complete = False

    card['data_complete'] = is_complete
    if not is_complete:
        incomplete += 1

print(f'Step 5 - Remaining incomplete cards: {incomplete}')

# ---- Step 6: Add old_id ----
for old_id, new_id in old_to_new.items():
    if new_id in cards:
        cards[new_id]['old_id'] = old_id

# ---- Write ----
with open('lib/data/card-data.json', 'w', encoding='utf-8') as f:
    json.dump(new_data, f, ensure_ascii=False, indent=4)

# Summary
total = len(cards)
complete = sum(1 for c in cards.values() if c.get('data_complete', True))
with_effects = sum(1 for c in cards.values() if len(c.get('effects', [])) > 0)
with_chakra = sum(1 for c in cards.values() if isinstance(c.get('chakra'), (int, float)) and c['chakra'] > 0)
print(f'\nFinal summary:')
print(f'  Total cards: {total}')
print(f'  Data complete: {complete}')
print(f'  With effects: {with_effects}')
print(f'  With chakra > 0: {with_chakra}')
