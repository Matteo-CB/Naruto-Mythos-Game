/**
 * Script: Populate name_en and title_en for all 192 cards in card-data.json
 *
 * Run once: node scripts/populate-en-translations.js
 */

const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'lib', 'data', 'card-data.json');

// ─── Character Name Mapping (FR → EN) ───
// Most names are identical. Only differences listed here.
const NAME_FR_TO_EN = {
  'CHÔJI AKIMICHI': 'CHOJI AKIMICHI',
  'GAÏ MAITO': 'MIGHT GUY',
  'GEMMA SHIRANUI': 'GENMA SHIRANUI',
  'HINATA HYÛGA': 'HINATA HYUGA',
  'ICHIBI': 'ONE-TAIL',
  'ITACHI UCHIWA': 'ITACHI UCHIHA',
  'JIRAYA': 'JIRAIYA',
  'JIRÔBÔ': 'JIROBO',
  'KANKURÔ': 'KANKURO',
  'KIDÔMARU': 'KIDOMARU',
  'KURENAI YUHI': 'KURENAI YUHI',
  'KYÛBI': 'NINE-TAILS',
  'NEJI HYÛGA': 'NEJI HYUGA',
  'REMPART': 'RASHOMON',
  'SASUKE UCHIWA': 'SASUKE UCHIHA',
  'TON TON': 'TONTON',
  'YUHI KURENAI': 'KURENAI YUHI',
  // Mission names (French → English)
  'Appel de soutien': 'Call for Support',
  'Examen Chûnin': 'Chunin Exam',
  'Trouver le traître': 'Find the Traitor',
  'Assassinat': 'Assassination',
  'Ramener': 'Bring It Back',
  "Sauvetage d'un ami": 'Rescue a Friend',
  'Je dois partir': 'I Have to Go',
  'Tendre un piège': 'Set a Trap',
  'Protéger le chef': 'Protect the Leader',
  'Entraînement au chakra': 'Chakra Training',
};

// ─── Title Translation Mapping (FR → EN) ───
// All 164 unique title_fr values translated to English
const TITLE_FR_TO_EN = {
  // Hokages & Elders
  'Le Professeur': 'The Professor',
  'Troisième Hokage': 'Third Hokage',
  'Cinquième Hokage': 'Fifth Hokage',
  'Quatrième Kazekage': 'Fourth Kazekage',
  '"Je suis la Cinquième Hokage du Village de Konoha !"': '"I am the Fifth Hokage of the Leaf Village!"',

  // Tsunade
  'La Création et le Renouveau': 'Creation Rebirth',
  'Maître Ninja Médical': 'Master Medical Ninja',
  'Destruction des blessures de guérison yin': 'Yin Healing Wound Destruction',
  'Maîtrise du Chakra': 'Chakra Mastery',

  // Shizune
  'Assistante de Tsunade': "Tsunade's Assistant",
  'Corps Médical du Village de la Feuille': 'Leaf Village Medical Corps',
  'Ninja Medical': 'Medical Ninja',

  // Jiraiya
  'Ermite des Crapauds': 'Toad Sage',
  'Ermite du Mont Myoboku': 'Sage of Mount Myoboku',
  'Sannin Légendaire': 'Legendary Sannin',
  'Jutsu d\'Invocation': 'Summoning Jutsu',
  'Dans l\'Estomac du Crapaud': 'Inside the Toad\'s Stomach',

  // Naruto
  'Je serai le plus grand Hokage!': 'I\'m gonna be the greatest Hokage!',
  'Genin du Village de la Feuille': 'Leaf Village Genin',
  'Permutation': 'Substitution',
  'Rasengan': 'Rasengan',
  'Believe it!': 'Believe it!',
  "Je n'fuirai pas !": "I won't run away!",

  // Sakura
  'Genin de l\'Équipe 7': 'Team 7 Genin',
  'Kunoichi': 'Kunoichi',
  'Poing Fort': 'Cherry Blossom Impact',

  // Sasuke
  'Dernier du Clan Uchiwa': 'Last of the Uchiha Clan',
  'Le dernier Uchiwa': 'The Last Uchiha',
  'Chidori': 'Chidori',
  'Sharingan': 'Sharingan',
  'Marque maudite du Ciel': 'Curse Mark of Heaven',

  // Kakashi
  'Le Ninja Copieur': 'The Copy Ninja',
  'Sensei de l\'Équipe 7': 'Team 7 Sensei',
  'L\'Éclair Pourfendeur': 'Lightning Blade',
  'Le Kaléidoscope Hypnotique du Sharingan': 'Mangekyo Sharingan',
  'Tsukuyomi': 'Tsukuyomi',

  // Team 10
  'Genin de l\'Équipe 10': 'Team 10 Genin',
  "C'est qui que tu traites de gros ?": 'Who are you calling fat?',
  'Décuplement': 'Expansion Jutsu',
  'Jutsu de Transfert d\'Esprit': 'Mind Transfer Jutsu',
  'Jutsu de Destruction Mentale': 'Mind Destruction Jutsu',
  'Manipulation des Ombres': 'Shadow Possession',
  'Jutsu d\'Étranglement par l\'Ombre': 'Shadow Strangle Jutsu',
  'Quelle galère...': 'What a drag...',
  'Sensei de l\'Équipe 10': 'Team 10 Sensei',
  'Lame de Chakra': 'Chakra Blade',

  // Team 8
  'Genin de l\'Équipe 8': 'Team 8 Genin',
  'Croc sur Croc': 'Fang over Fang',
  'Reste avec moi Akamaru.': 'Stay with me Akamaru.',
  'Le Loup Bicéphale': 'Two-Headed Wolf',
  'Les Hommes-Bêtes Enragés': 'Raging Man-Beast',
  'Byakugan': 'Byakugan',
  'Poing Souple': 'Gentle Fist',
  'Hakke Soixante-Quatre Paumes': 'Eight Trigrams Sixty-Four Palms',
  'Protective Eight Trigrams Sixty-Four Palms': 'Protective Eight Trigrams Sixty-Four Palms',
  'Insectes Destructeurs': 'Destruction Bugs',
  'Des clones faits d\'insectes': 'Bug Clone Technique',
  'Sensei de l\'Équipe 8': 'Team 8 Sensei',

  // Team Guy
  'Genin de l\'Équipe Gaï': 'Team Guy Genin',
  'Le « Tourbillon Divin » du Hakke': 'Eight Trigrams Rotation',
  'La Fleur du Lotus Recto': 'Primary Lotus',
  'Poing Ivre': 'Drunken Fist',
  'Entraînement au Poing violent': 'Strong Fist Training',
  'Tenten': 'Tenten',
  'Spécialiste des armes': 'Weapons Specialist',
  'Rising Twin Dragons': 'Rising Twin Dragons',
  'Sensei de l\'Équipe Gaï': 'Team Guy Sensei',
  'Ninpô ! La Danse du Chien !': 'Ninja Art: Beast Mimicry!',

  // Other Leaf
  'Entraîneur d\'Élite': 'Elite Trainer',
  'Agent du Conseil': 'Council Agent',
  'Instructeur de l\'Académie': 'Academy Instructor',
  'Surveillant des examens Chunin': 'Chunin Exam Proctor',
  'Scellement du Maléfice': 'Curse Sealing',
  'Garde d\'Élite': 'Elite Guard',

  // Anko
  'Invocation, La Réincarnation des Âmes': 'Summoning: Impure World Reincarnation',
  'Style d\'Orochimaru : Permutation': "Orochimaru Style: Substitution",

  // Orochimaru
  'La Poigne du Serpent Spectral': 'Shadow Snake Hands',
  'Invocation': 'Summoning',
  'Apposition des sceaux maléfiques': 'Five Elements Seal',
  'Épée de vent': 'Sword of Kusanagi',

  // Kabuto
  'Infiltré': 'Infiltrator',
  'La taupe': 'The Mole',
  'Shinobi talentueux': 'Talented Shinobi',

  // Sound Four + Kimimaro
  'La Danse du Camélia': 'Dance of the Camellia',
  'La Danse du Mélèze': 'Dance of the Larch',
  'Porteur de la Marque Maudite': 'Curse Mark Bearer',
  'Lien de l\'Arbre : Mort': 'Sawarabi no Mai: Bracken Dance',
  'Pluie d\'araignées': 'Spider Rain',
  'Déploiement de la Toile': 'Spider Web Deploy',
  'Fils de Chakra': 'Chakra Threads',
  'Possession moléculaire': 'Molecular Possession',
  'Marque Maudite de la Terre': 'Curse Mark of Earth',
  'Métamorphose Partielle': 'Partial Transformation',
  'Cette flûte est ma seule arme!': 'This flute is my only weapon!',
  'La Flûte Démoniaque': 'Demonic Flute',
  'Flûte Démoniaque : Chaînes de Fantasia': 'Demonic Flute: Phantom Sound Chains',
  'Destruction': 'Destruction',
  'La Geôle de Terre': 'Earth Prison',
  'Technique Secrète Noire : Vierge de Fer': 'Black Secret Technique: Iron Maiden',
  'Spectacle de marionnettes': 'Puppet Show',
  'Technique de Marionnettiste': 'Puppet Master Jutsu',

  // Jiraiya
  'Doton, Les Marécages des Limbes': 'Earth Style: Swamp of the Underworld',

  // Choji
  'Le Boulet Humain': 'Human Boulder',

  // Sound Trio
  'Haut-parleur à écho résonant': 'Resonating Echo Speaker',
  'Technique du Temple Nirvana': 'Temple of Nirvana Technique',
  'Ondes Cinglantes': 'Slicing Sound Waves',
  'Shinobi trop confiant': 'Overconfident Shinobi',
  'Tir d\'Aiguilles préparé': 'Prepared Needle Shot',

  // Sand Village
  'Bouclier de Sable': 'Sand Shield',
  'Cercueil de Sable': 'Sand Coffin',
  'Le Tombeau du Désert': 'Sand Burial',
  'Genin du Village du Sable': 'Sand Village Genin',
  'Ichibi': 'One-Tail',
  'Gaara': 'Gaara',
  'Tuteur de Gaara': "Gaara's Guardian",

  // Temari
  'La Grande Lame du Vent': 'Wind Scythe Jutsu',
  'Jutsu de la Faux du Vent': 'Sickle Weasel Jutsu',

  // Baki
  'Tranchoir': 'Wind Blade',

  // Zabuza & Haku
  'Le Ninja Déserteur du Village du Brouillard': 'Rogue Ninja of the Mist',
  'Prison Aqueuse': 'Water Prison',
  'Orphelin du Pays de l\'Eau': 'Orphan of the Land of Water',
  'Les Démoniaques Miroirs de Glace': 'Demonic Mirroring Ice Crystals',

  // Akatsuki
  'Akatsuki': 'Akatsuki',
  'Itachi Uchiwa': 'Itachi Uchiha',
  'Samehada': 'Samehada',
  'Absorption du chakra': 'Chakra Absorption',

  // Summons
  'Chef des Crapauds': 'Chief Toad',
  'Crapaud Armé': 'Armed Toad',
  'Fils aîné de Gama Bunta': "Gamabunta's Eldest Son",
  'Fils cadet de Gama Bunta': "Gamabunta's Youngest Son",
  'Limace Géante': 'Giant Slug',
  'Chien Ninja de Kakashi': "Kakashi's Ninja Dog",
  'Chiens Ninjas de Kakashi': "Kakashi's Ninja Hounds",
  'Chien Ninja': 'Ninja Hound',
  'Cochon Ninja de Tsunade': "Tsunade's Ninja Pig",
  'Invoqué par Orochimaru': 'Summoned by Orochimaru',

  // Mystic / Special
  'Mission Sacrificielle': 'Sacrificial Mission',
  'Ouïe Surhumaine': 'Superhuman Hearing',
  'Transposition': 'Transposition',
  'Clone du son de cloche': 'Bell Clone',
  'Équipe 7 originelle': 'Original Team 7',

  // Mythos / Secret / Rare Special
  "C'est fini.": "It's over.",
  "C'est terminé.": "It's finished.",
  'Défiant Naruto': 'Defying Naruto',
  'Défiant Sasuke': 'Defying Sasuke',
  'Traquant Naruto': 'Hunting Naruto',
  'Je les contrôle tous.': 'I control them all.',
  "J'espère que tu es prêt à mourir !": 'I hope you\'re ready to die!',
  'Je te rendrai fier, Sensei.': 'I\'ll make you proud, Sensei.',
  'Plus question de se cacher!': 'No more hiding!',
  'Sakura Haruno': 'Sakura Haruno',
  'Ôtez-vous de mon chemin.': 'Get out of my way.',
  'Orochimaru': 'Orochimaru',
  'Chôji Akimichi': 'Choji Akimichi',

  // Missions (title_fr = name_fr for missions)
  'Appel de soutien': 'Call for Support',
  'Examen Chûnin': 'Chunin Exam',
  'Trouver le traître': 'Find the Traitor',
  'Assassinat': 'Assassination',
  'Ramener': 'Bring It Back',
  "Sauvetage d'un ami": 'Rescue a Friend',
  'Je dois partir': 'I Have to Go',
  'Tendre un piège': 'Set a Trap',
  'Protéger le chef': 'Protect the Leader',
  'Entraînement au chakra': 'Chakra Training',
};

// ─── Main ───
const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const cards = raw.cards;

let updatedNames = 0;
let updatedTitles = 0;
let missingNames = [];
let missingTitles = [];

for (const [id, card] of Object.entries(cards)) {
  // --- name_en ---
  if (!card.name_en || card.name_en.trim() === '') {
    const enName = NAME_FR_TO_EN[card.name_fr];
    if (enName) {
      card.name_en = enName;
      updatedNames++;
    } else {
      // Default: use the French name as-is (most are already romanized Japanese)
      card.name_en = card.name_fr;
      updatedNames++;
    }
  }

  // --- title_en ---
  if (!card.title_en || card.title_en.trim() === '') {
    const tfr = card.title_fr;
    if (tfr && tfr.trim() !== '') {
      const enTitle = TITLE_FR_TO_EN[tfr];
      if (enTitle) {
        card.title_en = enTitle;
        updatedTitles++;
      } else {
        missingTitles.push({ id: card.id, title_fr: tfr });
      }
    } else {
      // No title at all — set empty
      card.title_en = '';
    }
  }
}

// Report
console.log(`Updated ${updatedNames} name_en values`);
console.log(`Updated ${updatedTitles} title_en values`);

if (missingTitles.length > 0) {
  console.log(`\nWARNING: ${missingTitles.length} cards still missing title_en:`);
  missingTitles.forEach(m => console.log(`  ${m.id}: ${JSON.stringify(m.title_fr)}`));
}

// Verify coverage
let totalWithNameEn = 0;
let totalWithTitleEn = 0;
for (const card of Object.values(cards)) {
  if (card.name_en && card.name_en.trim() !== '') totalWithNameEn++;
  if (card.title_en && card.title_en.trim() !== '') totalWithTitleEn++;
}
const totalCards = Object.keys(cards).length;
console.log(`\nCoverage: name_en ${totalWithNameEn}/${totalCards}, title_en ${totalWithTitleEn}/${totalCards}`);

// Write back
fs.writeFileSync(JSON_PATH, JSON.stringify(raw, null, 4), 'utf8');
console.log('\ncard-data.json updated successfully.');
