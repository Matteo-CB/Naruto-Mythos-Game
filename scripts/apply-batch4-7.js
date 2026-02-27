const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

function update(id, fields) {
  const card = data.cards[id];
  if (!card) { console.log('NOT FOUND: ' + id); return; }
  Object.assign(card, fields);
  if (card.card_type === 'character') {
    const complete = card.title_fr && card.group &&
      card.effects && card.effects.length > 0 &&
      card.keywords && card.keywords.length > 0;
    card.data_complete = !!complete;
  }
  console.log('Updated: ' + id + ' (complete=' + card.data_complete + ')');
}

function eff(type, desc) { return { type, description: desc, description_fr: '' }; }

// ============ UNCOMMON BATCH 4 ============

// KS-054-UC: KABUTO YAKUSHI / Nirvana Temple Jutsu
update('KS-054-UC', {
  chakra: 5, power: 5,
  keywords: ['Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('UPGRADE', 'POWERUP 1.'),
    eff('MAIN', 'Hide all other characters in this mission with less Power than this character.'),
  ],
});

// KS-056-UC: KIMIMARO / Shikotsumyaku
update('KS-056-UC', {
  chakra: 4, power: 6,
  keywords: ['Kekkei Genkai'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', '[⧗] If this character is affected by an enemy effect, the opponent must pay 1 Chakra, if able.'),
    eff('UPGRADE', 'Discard a card to hide a character in play with cost 4 or less.'),
  ],
});

// KS-058-UC: JIROBO / Earth Style Barrier: Earth Dome Prison
update('KS-058-UC', {
  chakra: 4, power: 4,
  keywords: ['Sound Four', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', 'POWERUP 1 to all other friendly Sound Four characters in this mission.'),
    eff('UPGRADE', 'Apply the MAIN effect to Sound Four characters in the other missions.'),
  ],
});

// KS-060-UC: KIDOMARU / Spiral Spider Web
update('KS-060-UC', {
  chakra: 4, power: 4,
  keywords: ['Sound Four', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', 'Move a character from this mission.'),
    eff('AMBUSH', 'Defeat an enemy character with Power 1 or less in play.'),
  ],
});

// KS-062-UC: SAKON / Black Seal
update('KS-062-UC', {
  chakra: 4, power: 4,
  keywords: ['Sound Four', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('AMBUSH', 'Copy an instant effect of another friendly Sound Four character in play.'),
  ],
});

// ============ UNCOMMON BATCH 5 ============

// KS-063-UC: UKON / Molecular Possession
update('KS-063-UC', {
  chakra: 5, power: 6,
  keywords: ['Sound Four', 'Kekkei Genkai'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', '[⧗] You can play this character as an upgrade over any Sound Village character.'),
  ],
});

// KS-065-UC: TAYUYA / Demon Flute
update('KS-065-UC', {
  chakra: 4, power: 4,
  keywords: ['Sound Four', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('AMBUSH', 'POWERUP 2 a friendly Sound Village character in play.'),
    eff('UPGRADE', 'Look at the 3 top cards of your deck, reveal and draw any Summon characters, then put back the other cards.'),
  ],
});

// KS-066-UC: RAGE OGRES / Summoning (Doki)
update('KS-066-UC', {
  chakra: 4, power: 5,
  keywords: ['Summon'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', 'If you have a Sound Four character in this mission, steal 1 Chakra from the opponent.'),
    eff('MAIN', '[⧗] At the end of the round, you must take back this character in hand.'),
  ],
});

// KS-067-UC: RASHOMON / Summoning
update('KS-067-UC', {
  chakra: 4, power: 0,
  keywords: ['Summon'],
  group: 'Independent',
  effects: [
    eff('MAIN', '[⧗] The strongest enemy character in this mission loses all Power tokens and has its Power set to 0.'),
    eff('MAIN', '[⧗] At the end of the round, you must return this character to your hand.'),
  ],
});

// KS-069-UC: DOSU KINUTA / Resonating Echo Speaker
update('KS-069-UC', {
  chakra: 4, power: 5,
  keywords: ['Sound Ninja', 'Weapon'],
  group: 'Sound Village',
  effects: [
    eff('UPGRADE', 'Look at a hidden character in play.'),
    eff('MAIN', 'Choose a hidden enemy character in play. Opponent must either play them paying 2 more, or defeat them.'),
  ],
});

// ============ UNCOMMON BATCH 6 ============

// KS-071-UC: ZAKU ABUMI / Slicing Sound Wave
update('KS-071-UC', {
  chakra: 4, power: 5,
  keywords: ['Sound Ninja'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', 'If you have less non-hidden characters than the opponent in this mission, move an enemy character from this mission.'),
    eff('UPGRADE', 'POWERUP 2.'),
  ],
});

// KS-078-UC: KANKURO / Puppet Master Jutsu
update('KS-078-UC', {
  chakra: 4, power: 4,
  keywords: ['Team Baki', 'Jutsu'],
  group: 'Sand Village',
  effects: [
    eff('AMBUSH', 'Move any character with Power 4 or less.'),
    eff('UPGRADE', 'Play a friendly character while hidden, paying 1 less.'),
  ],
});

// KS-082-UC: BAKI / Wind Sword
update('KS-082-UC', {
  chakra: 4, power: 4,
  keywords: ['Team Baki'],
  group: 'Sand Village',
  effects: [
    eff('SCORE', 'Defeat a hidden character in play.'),
    eff('UPGRADE', 'Defeat an enemy character with Power 1 or less in this mission.'),
  ],
});

// KS-083-UC: RASA / Fourth Kazekage
update('KS-083-UC', {
  chakra: 3, power: 3,
  keywords: [],
  group: 'Sand Village',
  effects: [
    eff('SCORE', 'Gain 1 Mission point if there\'s another friendly Sand Village character in this mission.'),
  ],
});

// KS-085-UC: YASHAMARU / Sacrificial Mission
update('KS-085-UC', {
  chakra: 4, power: 4,
  keywords: ['Jutsu'],
  group: 'Sand Village',
  effects: [
    eff('SCORE', 'Defeat this character. If you do so, defeat another character in this mission.'),
  ],
});

// ============ UNCOMMON BATCH 7 ============

// KS-087-UC: ZABUZA MOMOCHI / Water Prison Jutsu
update('KS-087-UC', {
  chakra: 5, power: 5,
  keywords: ['Rogue Ninja', 'Jutsu'],
  group: 'Independent',
  effects: [
    eff('MAIN', 'If there\'s only one non-hidden enemy character in this mission, hide them.'),
    eff('UPGRADE', 'MAIN effect: Instead, defeat them.'),
  ],
});

// KS-089-UC: HAKU / Crystal Ice Mirrors
update('KS-089-UC', {
  chakra: 4, power: 2,
  keywords: ['Rogue Ninja', 'Jutsu'],
  group: 'Independent',
  effects: [
    eff('MAIN', 'Discard the top card of your opponent\'s deck. POWERUP X where X is the cost of the discarded card.'),
    eff('UPGRADE', 'MAIN effect: Instead, discard the top card from your deck.'),
  ],
});

// KS-091-UC: ITACHI UCHIHA / Mangekyo Sharingan
update('KS-091-UC', {
  chakra: 5, power: 5,
  keywords: ['Rogue Ninja', 'Kekkei Genkai'],
  group: 'Akatsuki',
  effects: [
    eff('MAIN', 'Look at the opponent\'s hand.'),
    eff('UPGRADE', 'MAIN effect: In addition, choose 1 card in the opponent\'s hand and discard it.'),
  ],
});

// KS-093-UC: KISAME HOSHIGAKI / Samehada
update('KS-093-UC', {
  chakra: 6, power: 6,
  keywords: ['Rogue Ninja', 'Weapon'],
  group: 'Akatsuki',
  effects: [
    eff('MAIN', 'Remove up to 2 Power tokens from an enemy character in play and put them on this character.'),
    eff('UPGRADE', 'MAIN effect: Instead, remove all Power tokens and put them on this character.'),
  ],
});

// KS-102-UC: MANDA / Summoned by Orochimaru
update('KS-102-UC', {
  chakra: 3, power: 5,
  keywords: ['Summon'],
  group: 'Independent',
  effects: [
    eff('AMBUSH', 'Defeat an enemy Summon character in this mission.'),
    eff('MAIN', '[⧗] At the end of the round, you must return this character to your hand.'),
  ],
});

// KS-103-UC: GIANT SPIDER / Rain of Spiders
update('KS-103-UC', {
  chakra: 4, power: 4,
  keywords: ['Summon'],
  group: 'Independent',
  effects: [
    eff('MAIN', '[⧗] At the end of the round, hide a character with Power equal or less than this character. Then, you must return this character to your hand.'),
  ],
});

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. 16 UC cards applied (batches 4-7). All UC cards done!');
