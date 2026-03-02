/**
 * brute9-omega.js — ULTIMATE brute-force, 1350 concurrent
 *
 * NEW vs brute8:
 *   1. DICTIONARY ENUMERATION: 350+ single words tried as titles for ALL cards
 *   2. COMBINATORIAL PAIRS: per-card word pools, all A_B pairs generated
 *   3. LOWERCASE VARIANTS: every URL also tried in all-lowercase
 *   4. NEW RARITY FORMATS: R_Art, Secret_Gold, MV_GOLD, etc.
 *   5. REVERSED NAME-TITLE: try title before name (e.g. 115_R_Insect_Wall_Shino)
 *   6. NO-SEPARATOR titles: ShadowSnake, InsectWall, etc.
 *   7. 1350 concurrent (3x brute8)
 *   8. Detailed console logging
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────
const CONCURRENCY = 1350;
const DELAY_MS = 1;
const TIMEOUT_MS = 5000;
const MIN_SIZE = 5000;
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const BASE2 = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/';
const agent = new https.Agent({ keepAlive: true, maxSockets: 1500, maxFreeSockets: 200 });
const OUT = path.join(__dirname, '..', 'newvisual');
const PROG = path.join(OUT, 'brute9_progress.json');

// ─── STATE ───────────────────────────────────────────────────────
let testedSet = new Set();
let found = [];
let interrupted = false;
let totalTested = 0;
let totalNew = 0;
let totalSkipped = 0;
let startTime = Date.now();

// ─── PROGRESS LOADING ────────────────────────────────────────────
function loadTested() {
  // ONLY load brute6 (completed) and brute9 (for resume).
  // brute7 and brute8 run IN PARALLEL — don't load their progress!
  const files = ['brute6_progress.json','brute9_progress.json'];
  for (const f of files) {
    try {
      const p = path.join(OUT, f);
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const d = JSON.parse(raw);
        const before = testedSet.size;
        (d.tested || []).forEach(u => testedSet.add(u));
        if (d.found) found.push(...d.found);
        console.log(`  [LOAD] ${f}: +${testedSet.size - before} URLs (total: ${testedSet.size})`);
      }
    } catch(e) { console.log(`  [WARN] Failed to load ${f}: ${e.message}`); }
  }
  console.log(`  [LOAD] Total previously tested (brute6 only): ${testedSet.size.toLocaleString()}`);
  console.log(`  [INFO] brute7+brute8 progress NOT loaded — they run in parallel`);
}

function saveProgress() {
  const arr = [...testedSet].slice(-200000);
  fs.writeFileSync(PROG, JSON.stringify({ tested: arr, found, saved: new Date().toISOString() }));
}

// ─── HTTP ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function head(url) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname, method: 'HEAD',
        timeout: TIMEOUT_MS, agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: 'https://www.narutotcgmythos.com/',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
        }
      }, res => {
        res.resume();
        resolve({ url, s: res.statusCode, sz: parseInt(res.headers['content-length']||'0',10) });
      });
      req.on('error', () => resolve({ url, s: 0, sz: 0 }));
      req.on('timeout', () => { req.destroy(); resolve({ url, s: 0, sz: 0 }); });
      req.end();
    } catch(e) { resolve({ url, s: 0, sz: 0 }); }
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(dest);
    https.get(url, { agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        f.close(); try{fs.unlinkSync(dest)}catch(e){} download(res.headers.location, dest).then(resolve).catch(reject); return;
      }
      if (res.statusCode !== 200) { f.close(); try{fs.unlinkSync(dest)}catch(e){} reject(new Error('HTTP '+res.statusCode)); return; }
      res.pipe(f); f.on('finish', () => { f.close(); resolve(); });
    }).on('error', e => { f.close(); try{fs.unlinkSync(dest)}catch(e2){} reject(e); });
  });
}

// ─── GLOBAL DICTIONARY ──────────────────────────────────────────
// 350+ words extracted from ALL gallery URLs + Naruto vocabulary + common descriptors
// This is the KEY new feature: exhaustive single-word enumeration
const DICT = [
  // === Words confirmed in gallery CDN filenames ===
  'Professor','Hokage','Master','Reserve','Seal','Assistant','Needle','Shot','Toad','Sage',
  'Dark','Swamp','Genin','Substitution','Chakra','Prowess','Last','Sharingan','Teacher',
  'Expansion','Human','Boulder','Mind','Transfer','Shadow','Possession','Trench','Knives',
  'All','Four','Hound','Man','Beast','Clone','Two','Headed','Wolf','Gentle','fist','Fist',
  'Byakugan','Parasitic','Insects','Tree','Bind','Palm','Rotation','Training','Primary',
  'Lotus','Weapon','Specialist','Ferocious','Proctor','Trainer','Instructor','Shinobi',
  'Elite','Guard','Undercover','Infiltrator','Yin','Healing','Nirvana','Temple','Camelia',
  'Dance','Shikotsumyaku','Bearer','Earth','Dome','Spider','Web','Black','Molecular',
  'Demon','Flute','Summoning','Superhuman','Echo','Speaker','Slicing','Kunoichi','Bell',
  'Sound','Jinchuriki','Sand','Shield','Partial','Trasformation','Threads','Puppet',
  'Jutsu','Sandstorm','Council','Agent','Careteaker','Kubikiribocho','Orphan','Crystal',
  'Ice','Mirrors','Akatsuki','Rogue','Ninja','Chief','Armed','Eldest','Son','Youngest',
  'Giant','Slug','Pig','Medical','Strangle','Chili','Pepper','Loopy','Iron','Maiden',
  'Coffin','Wind','Scythe','Control','Hunting','absorb','Rasengan','Recovery','Team',
  'Heaven','Curse','Mark','Lightning','Blade','Transference','Ritual','Original',
  'Summoning','Jutsu','Transformation',
  // === Common Naruto technique/character words ===
  'Snake','Snakes','Serpent','Viper','Cobra','Python','Fang','Fangs','Claw','Claws',
  'Insect','Bug','Bugs','Wall','Barrier','Fortress','Armor','Swarm','Colony','Hive',
  'Beetle','Cocoon','Nest','Wave','Pillar','Eight','Trigrams','Sixty','Palms','Strike',
  'Kaiten','Tenketsu','Juken','Vakuum','Vacuum','Air','Arhat','Punch','Slam','Brute',
  'Ogre','Golem','Rock','Stone','Titan','Colossus','Drain','Siphon','Devour','Glutton',
  'Bow','Arrow','Gold','Golden','Archer','Marksman','Sniper','Arachnid','Thread','Net',
  'Kusanagi','Sword','Fear','Terror','Horror','Nightmare','Villain','Lord','King',
  'Parasite','Leech','Merge','Twin','Twins','Brothers','Fusion','Split','Double',
  'Fox','Cloak','Shroud','Aura','Red','Crimson','Chakra','Demon','Rage','Fury','Berserk',
  'Feral','Wild','Unleashed','Released','Overflow','Hatred','Malice','Possessed',
  'Tanuki','Raccoon','Shukaku','Monster','Kaiju','Colossal','Massive','Golem',
  'Awakened','Awakening','Awakens','Destruction','Rampage','Catastrophe','Inferno',
  'Cataclysm','Havoc','Chaos','Ruin','Devastation','Annihilation','Roar','Bomb',
  'Gatsuuga','Tsuga','Tunneling','Piercing','Dynamic','Drill','Spinning','Charge',
  'Rush','Impact','Sprint','Tracking','Pursuit','Hunt','Hunter','Tracker','Nose',
  'Drunken','Drunk','Tipsy','Suiken','Intoxicated','Stagger','Stumble','Wobbly',
  'Loopy','Hurricane','Entry','Kick','Barrage','Flurry','Combo','Taijutsu','Youth',
  'Amaterasu','Flame','Flames','Black','Mangekyo','Tsukuyomi','Susanoo','Genjutsu',
  'Crow','Crows','Raven','Inferno','Blaze','Ignite','Ember','Ash','Scorch','Char',
  'Burning','Inextinguishable','Eternal','Divine','Celestial','Totsuka','Yata',
  'Burial','Funeral','Sabaku','Desert','Quicksand','Tomb','Grave','Crushing',
  'Engulf','Swallow','Prison','Cage','Trap','Capture','Encase','Cascade','Flow',
  // === Short descriptive words (CDN sometimes uses 1 word) ===
  'Power','Attack','Defense','Technique','Secret','Hidden','True','Full','Complete',
  'Ultimate','Final','Supreme','Grand','Great','Legendary','Ancient','Sacred','Forbidden',
  'Deadly','Lethal','Fatal','Fierce','Savage','Brutal','Vicious','Mighty','Strong',
  'Unstoppable','Invincible','Unbreakable','Indomitable','Fearless','Ruthless','Relentless',
  'Wrath','Vengeance','Destruction','Annihilation','Oblivion','Apocalypse','Judgment',
  'Absolute','Infinite','Eternal','Immortal','Divine','Holy','Demonic','Cursed',
  'Seal','Sealed','Branded','Marked','Possessed','Corrupted','Tainted','Infected',
  // === One-word titles seen on CDN for other cards ===
  'Bearer','Proctor','Genin','Teacher','Hokage','Orphan','Kunoichi','Shinobi',
  'Infiltrator','Undercover','Superhuman','Slicing','Summoning','Specialist',
  'Sandstorm','Rasengan','Control','Hunting','Medical',
  // === Japanese technique names ===
  'Senei','Jashu','Kikaichuu','Kikaichu','Hakke','Rokujuyon','Tarenken',
  'Kumoshibari','Kuchiyose','Sabaku','Soso','Kyuu','Taiso','Suiken','Zuiken',
  // === French words (CDN might use French) ===
  'Serpent','Ombre','Mur','Insecte','Poing','Pierre','Araignee','Arc',
  'Renard','Manteau','Sable','Cercueil','Tombeau','Crocs','Ivresse','Flamme',
  // === Misc creative descriptors ===
  'Version','Level','Stage','State','Mode','Form','Phase','Step',
  'V1','V2','Level1','Level2','Stage1','Stage2',
  'Awakened','Powered','Charged','Enhanced','Evolved','Advanced','Superior',
  'Primal','Feral','Savage','Beastly','Monstrous','Terrifying','Horrifying',
];

// Deduplicate dictionary
const DICTIONARY = [...new Set(DICT)];

// ─── RARITY PREFIXES ─────────────────────────────────────────────
const R_PREFIXES  = ['R','R_ART','RA','ART','Rare','Rare_Art','R-ART','R_Art','r','R_art','Rare_ART'];
const RA_PREFIXES = ['R_ART','RA','ART','Rare_Art','R-ART','R_Art','R_ART_GOLD','r_art','R_art','Rare_ART','R_ART_Special'];
const S_PREFIXES  = ['Secret_GOLD','SecretV_GOLD','S','Secret','SecretV','Secret_Gold','Secret_SILVER','S_GOLD','Gold','Secret_gold','GOLD','SecretV_Gold','Secret_Special','S_Special'];
const M_PREFIXES  = ['M','M_Special','MV','MV_Special','Mythos','M_special','Mythos_Special','M_SPECIAL','MV_GOLD','M_GOLD','M_Gold'];
const UC_PREFIXES = ['UC','Uncommon','U','uc'];

// ─── 19 CARDS DEFINITION ────────────────────────────────────────
// Each card has: names, rarity prefixes, priority titles (specific), combo words (for pairs)
const CARDS = [
  { id:'KS-045-UC', num:45, r:UC_PREFIXES,
    names:['Anko','Anko_Mitarashi','AnkoMitarashi','Mitarashi','Mitarashi_Anko'],
    priority: ['Shadow_Snake','Snake_Hands','Shadow_Snake_Hands','Striking_Shadow','Striking_Shadow_Snakes','Hidden_Shadow_Snake','Sen_Ei','Sen_Ei_Jashu','Senei_Jashu','Senei','Jashu','Shadow_Snake_Hand','Snake_Hand','Special_Jonin','Forest_Death','Snake_Strike','Snake_Fang','Serpent_Strike','Twin_Snakes','Snake_Authority','Multiple_Snakes','Snake_Jutsu','Snake_Technique','Branded','Cursed_Seal','Shadow_Serpent','Striking','Sen_Ei_Ta_Jashu','Dual_Snake','Hidden_Shadow','Multiple_Hidden','Formation_of_Ten','Coiling','Summoning_Snake'],
    combo: ['Shadow','Snake','Snakes','Serpent','Hands','Hand','Strike','Fang','Hidden','Striking','Sen','Ei','Jashu','Senei','Twin','Multiple','Coil','Viper','Cobra','Bite','Venom','Poison','Deadly','Branded','Cursed','Seal','Forest','Death','Special','Jonin'] },

  { id:'KS-115-R', num:115, r:R_PREFIXES,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame','Aburame_Shino'],
    priority: ['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Wall_Technique','Bug_Dome','Insect_Dome','Insect_Sphere','Bug_Sphere','Parasitic_Wall','Parasitic_Destruction','Hidden_Insect','Destruction_Host','Kikaichuu','Kikaichu','Insect_Shield','Bug_Shield','Bug_Barrier','Insect_Barrier','Insect_Armor','Bug_Armor','Bug_Swarm','Insect_Swarm','Insect_Fortress','Bug_Fortress','Colony_Wall','Insect_Cocoon','Insect_Nest','Insect_Protection','Bug_Defense','Wall_Technique','Parasitic_Insects','Secret_Technique','Insect_Pillar','Insect_Wave'],
    combo: ['Insect','Bug','Bugs','Wall','Dome','Sphere','Shield','Barrier','Armor','Swarm','Colony','Hive','Beetle','Cocoon','Nest','Wave','Pillar','Parasitic','Destruction','Host','Hidden','Secret','Technique','Kikaichuu','Kikaichu','Defense','Protection','Fortress','Living','Formation'] },

  { id:'KS-115-RA', num:115, r:RA_PREFIXES,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame'],
    priority: ['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Dome','Bug_Dome','Insect_Shield','Bug_Shield','Parasitic_Wall','Parasitic_Destruction','Destruction_Host','Kikaichuu','Insect_Barrier','Bug_Barrier','Insect_Armor','Insect_Fortress','Colony_Wall','Insect_Swarm','Secret_Technique','Insect_Cocoon','Insect_Pillar'],
    combo: ['Insect','Bug','Wall','Dome','Shield','Barrier','Armor','Swarm','Colony','Hive','Beetle','Cocoon','Parasitic','Destruction','Host','Hidden','Secret','Technique','Kikaichuu','Formation'] },

  { id:'KS-116-RA', num:116, r:RA_PREFIXES,
    names:['Neji','Neji_Hyuga','NejiHyuga','Hyuga','Hyuga_Neji'],
    priority: ['Eight_Trigrams','Sixty-Four_Palms','Sixty_Four_Palms','Eight_Trigrams_64','Hakke','Rokujuyon','64_Palms','Gentle_fist','Gentle_Fist','Palm_Rotation','Rotation','Byakugan','Air_Palm','Vacuum_Palm','Divination','Prodigy','Hyuga_Prodigy','Destiny','Trigrams','Palms','Strike','Kaiten','Tenketsu','Juken','Sixty-Four','SixtyFour_Palms','Eight_Trigrams_Sixty-Four','Palms_Strike','Heavenly_Spin','360','Full_View','Palm_Bottom','Chakra_Points','All_Seeing','White_Eye'],
    combo: ['Eight','Trigrams','Sixty','Four','Palms','Palm','Rotation','Gentle','Fist','fist','Byakugan','Air','Vacuum','Divination','Prodigy','Destiny','Hakke','Strike','Kaiten','Tenketsu','Juken','Heavenly','Spin','White','Eye','All','Seeing','64','View','Bottom','Chakra','Points'] },

  { id:'KS-122-R', num:122, r:R_PREFIXES,
    names:['Jirobo','Jiroubou','Jirobou','Jirôbô','Jiroubô'],
    priority: ['Arhat','Arhat_Fist','Earth_Dome','Earth_Prison','Earth_Barrier','Absorbing_Barrier','Chakra_Drain','Absorbing','Absorption','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Full_Power','Sound_Four','Ogre','Golem','Giant','Fist','Power','Punch','Slam','Brute','Brute_Force','Rage','Monster','Titan','Earth_Fist','Stone_Fist','Stone','Earth','Chakra_Absorb','Drain','Glutton','Feast','Devour','Awakened','Dark_Power','Powered_Up','Hulk','Colossus','Smash','Ground_Pound','Body_Slam','Siphon','Consume'],
    combo: ['Arhat','Fist','Earth','Dome','Prison','Barrier','Absorb','Drain','Chakra','Cursed','Seal','Level','Two','Power','Full','Giant','Ogre','Golem','Stone','Punch','Slam','Brute','Rage','Monster','Titan','Hulk','Smash','Ground','Pound','Body','Dark','Awakened'] },

  { id:'KS-122-RA', num:122, r:RA_PREFIXES,
    names:['Jirobo','Jiroubou','Jirobou'],
    priority: ['Arhat','Arhat_Fist','Earth_Dome','Earth_Prison','Absorbing_Barrier','Cursed_Seal','Level_Two','Second_State','Full_Power','Ogre','Golem','Giant','Fist','Power','Stone_Fist','Stone','Earth_Fist','Drain','Glutton','Monster','Titan','Brute','Rage','Awakened','Dark_Power','Slam','Punch'],
    combo: ['Arhat','Fist','Earth','Dome','Prison','Barrier','Cursed','Seal','Level','Power','Giant','Ogre','Stone','Punch','Brute','Rage','Monster','Titan','Awakened','Dark','Drain'] },

  { id:'KS-124-R', num:124, r:R_PREFIXES,
    names:['Kidomaru','Kidoumaru','Kidômaru'],
    priority: ['Spider_Bow','Fierce_Rip','Spider_Bow_Fierce','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Kumoshibari','Spider_Thread','Spider_Net','Spider_Web','Web','Spider','Cursed_Seal','Level_Two','Second_State','Sound_Four','Archer','Hunter','Third_Eye','Six_Arms','Sticky','Golden','Gold','Cocoon','Marksman','Sniper','Projectile','Long_Range','Arachnid','Spider_Armor','Web_Armor','Sticky_Gold','Multi_Arm','Six_Arm','Strategy','Tactical','Precision','Shot','Shoot','Target','Aim'],
    combo: ['Spider','Bow','Fierce','Rip','Gold','Golden','Arrow','War','Web','Thread','Net','Cursed','Seal','Level','Archer','Hunter','Eye','Third','Six','Arms','Arm','Sticky','Cocoon','Marksman','Sniper','Shot','Arachnid','Armor','Precision','Target','Aim','Long','Range'] },

  { id:'KS-124-RA', num:124, r:RA_PREFIXES,
    names:['Kidomaru','Kidoumaru'],
    priority: ['Spider_Bow','Fierce_Rip','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Spider_Thread','Spider_Web','Web','Spider','Cursed_Seal','Level_Two','Archer','Hunter','Third_Eye','Six_Arms','Sticky','Gold','Cocoon','Marksman','Sniper','Arachnid','Spider_Armor'],
    combo: ['Spider','Bow','Fierce','Rip','Gold','Golden','Arrow','War','Web','Thread','Cursed','Seal','Archer','Hunter','Eye','Six','Arms','Sticky','Cocoon','Sniper','Armor'] },

  { id:'KS-126-R', num:126, r:R_PREFIXES,
    names:['Orochimaru'],
    priority: ['Summoning','Summoning_Jutsu','Snake_Summoning','Manda','Giant_Snake','Triple_Rashomon','Rashomon','Kusanagi','Grass_Cutter','Sword','Blade','Five_Pronged','Living_Corpse','Body_Transfer','Transference','Snake','Snake_Lord','Snake_Master','Sannin','Fear','Intimidation','Fury','Wrath','Threat','Confrontation','Power','Immortal','Forbidden','True_Form','True_Power','Villain','Invasion','White_Snake','Unstoppable','Obstacle','Force','Domination','Overwhelming','Terror','Nightmare','Shadow','Darkness','Evil','Ambition','Kuchiyose','Rebirth','Immortality','Experiment','Tongue','Shed','Sacrifice','Curse','Heaven','Branded','Jutsu','Kinjutsu'],
    combo: ['Summoning','Snake','Manda','Giant','Rashomon','Kusanagi','Sword','Blade','Fear','Terror','Wrath','Fury','Power','Immortal','Forbidden','True','Form','White','Lord','Master','Sannin','Invasion','Evil','Dark','Darkness','Shadow','Curse','Heaven','Seal','Branded','Living','Corpse','Body','Transfer','Tongue','Shed','Rebirth','Experiment','Sacrifice'] },

  { id:'KS-127-R', num:127, r:R_PREFIXES,
    names:['Sakon','Sakon_Ukon','SakonUkon','Ukon','Ukon_Sakon'],
    priority: ['Stone_Fist','Tarenken','Multiple_Fist','Multiple_Connected_Fist','Parasite','Demon_Parasite','Parasitic','Molecular_Possession','Possession','Black_Seal','Cursed_Seal','Cursed_Seal_Level_2','Level_Two','Second_State','Merge','Combined','Fusion','Ukon_Merge','Twin','Twins','Brothers','Sound_Four','Combined_Attack','Punch','Fist','Demon','Monster','Rashomon','Attach','Leech','Absorb','Host','Body','Inside','Inhabit','Split','Together','Duo','Pair','Double','Merged','United','Connected','Linked','Infect','Conjoined'],
    combo: ['Stone','Fist','Tarenken','Multiple','Parasite','Demon','Parasitic','Molecular','Possession','Black','Seal','Cursed','Level','Merge','Combined','Fusion','Twin','Twins','Brothers','Punch','Monster','Leech','Absorb','Host','Body','Split','Duo','Pair','Double','Merged','Connected','Ukon','Attack'] },

  { id:'KS-127-RA', num:127, r:RA_PREFIXES,
    names:['Sakon','Sakon_Ukon','Ukon'],
    priority: ['Stone_Fist','Tarenken','Multiple_Fist','Parasite','Demon_Parasite','Molecular_Possession','Possession','Black_Seal','Cursed_Seal','Level_Two','Merge','Combined','Fusion','Twin','Punch','Fist','Demon','Monster','Leech','Host','Body','Split','Duo','Pair','Merged','Connected'],
    combo: ['Stone','Fist','Tarenken','Multiple','Parasite','Demon','Molecular','Possession','Black','Seal','Cursed','Merge','Fusion','Twin','Punch','Monster','Leech','Host','Body','Split','Duo','Merged','Ukon'] },

  { id:'KS-129-R', num:129, r:[...R_PREFIXES,...M_PREFIXES],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Naruto','Naruto_Kyubi','Naruto_Fox','Kurama','Fox','Demon_Fox'],
    priority: ['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Red_Aura','Chakra_Cloak','Bijuu_Cloak','Jinchuuriki','Jinchuriki','Partial_Trasformation','Partial_Transformation','Version_1','V1','Awakening','One_Tail_Cloak','Fox','Demon','Red','Rage','Rampage','Beast','Beast_Cloak','Fury','Berserk','Feral','Wild','Unleashed','Released','Uncontrolled','Crimson','Seal','Broken_Seal','Tailed_Beast','Shroud','Red_Shroud','Chakra_Shroud','Aura','Frenzy','Possessed','Overflow','Seal_Weakening','Dark_Chakra','Tail','Initial_Form','Cloak_V1'],
    combo: ['Demon','Fox','Cloak','Red','Chakra','Aura','Shroud','Beast','Rage','Fury','Berserk','Feral','Wild','Unleashed','Released','Seal','Broken','Tailed','Nine','Tails','Partial','Trasformation','Transformation','V1','Version','Initial','Mode','Crimson','Dark','Overflow','Possessed','Jinchuriki','Bijuu','Kurama'] },

  { id:'KS-129-RA', num:129, r:[...RA_PREFIXES,...M_PREFIXES],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','Naruto','Naruto_Kyubi','Kurama','Fox','Demon_Fox'],
    priority: ['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Bijuu_Cloak','Jinchuriki','Partial_Trasformation','Partial_Transformation','V1','Fox','Demon','Red','Rage','Beast','Beast_Cloak','Fury','Berserk','Unleashed','Crimson','Seal','Shroud','Red_Shroud','Aura','Frenzy','Possessed','Overflow'],
    combo: ['Demon','Fox','Cloak','Red','Chakra','Aura','Shroud','Beast','Rage','Fury','Berserk','Wild','Unleashed','Seal','Tailed','Partial','Trasformation','Crimson','Dark','Possessed','Bijuu','Kurama'] },

  { id:'KS-130-R', num:130, r:[...R_PREFIXES,...M_PREFIXES],
    names:['One-Tail','One_Tail','OneTail','Ichibi','Gaara','Gaara_Shukaku','Shukaku','Gaara_One-Tail','Gaara_Ichibi'],
    priority: ['Full_Trasformation','Complete_Trasformation','Full_Transformation','Complete_Transformation','Trasformation','Transformation','Sand_Monster','Full_Beast','Sand_Demon','Tanuki','Beast','Monster','Sand_Spirit','Shukaku','Full_Shukaku','Awakened','Possession','Possessed','Die','Ready_to_Die','Full','Demon','Jinchuriki','Sand','Sand_Form','Sand_Beast','Sand_Tanuki','Rampage','Berserk','Unleashed','Giant','Colossal','Kaiju','Raccoon','Raccoon_Dog','Bijuu','Tailed_Beast','Sand_Golem','Golem','Sand_Giant','Final_Form','Fury','Madness','Insanity','Wild','Uncontrolled'],
    combo: ['Full','Trasformation','Transformation','Complete','Sand','Monster','Beast','Demon','Tanuki','Shukaku','Awakened','Possessed','Possession','Giant','Colossal','Golem','Raccoon','Bijuu','Tailed','Rampage','Berserk','Unleashed','Fury','Madness','Wild','Die','Ready','Death','Kaiju','Form','Final'] },

  { id:'KS-134-S', num:134, r:S_PREFIXES,
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Nine-Tailed_Fox','Nine_Tailed_Fox','NineTailed','Fox','Naruto','Kurama','Demon_Fox','Bijuu','Naruto_Kyubi'],
    priority: ['Beast_Awakens','Awakens','Awakening','Destruction','Giant_Fox','Full_Power','Unleashed','Bijuu','Demon_Fox','Tailed_Beast','Berserk','Rampage','Roar','Rage','Beast_Bomb','Bijuudama','Full_Beast','Beast','Fox','Giant','Power','Awakened','Released','Unbound','Free','Demon','Monster','Kaiju','Overwhelming','Seal_Break','Broken_Seal','Fury','Wrath','Catastrophe','Apocalypse','Devastation','Annihilation','Havoc','Chaos','Explosion','Blast','Shockwave','Inferno','Cataclysm'],
    combo: ['Beast','Awakens','Awakening','Destruction','Giant','Fox','Full','Power','Unleashed','Demon','Tailed','Berserk','Rampage','Roar','Rage','Bomb','Bijuu','Released','Free','Monster','Kaiju','Seal','Break','Broken','Fury','Wrath','Catastrophe','Havoc','Chaos','Explosion','Blast','Inferno','Nine','Tails'] },

  { id:'KS-149-M', num:149, r:M_PREFIXES,
    names:['Kiba','Kiba_Inuzuka','KibaInuzuka','Inuzuka','Inuzuka_Kiba','Kiba_Akamaru'],
    priority: ['Fang','Fang_Over_Fang','Fang_over_Fang','Double_Fang','Gatsuuga','Gatsuga','Tsuga','Two-Headed','Two-Headed_Wolf','Two_Headed_Wolf','Man_Beast','Man_Beast_Clone','Beast_Clone','Wild','Wild_Fang','Dynamic','Wolf','Wolves','Pack','Duo','Combo','Partner','All_Four','Tunneling_Fang','Passing_Fang','Beast','Canine','Dog','Hound','Drill','Spinning','Twin_Fang','Dual_Fang','Inuzuka_Style','Beast_Mimicry','Clone','Dynamic_Marking','Tracking','Hunt','Hunter','Sprint','Speed','Charge','Rush','Impact','Collision','Ram','Slam'],
    combo: ['Fang','Over','Double','Gatsuuga','Gatsuga','Tsuga','Two','Headed','Wolf','Man','Beast','Clone','Wild','Dynamic','Pack','Duo','Combo','All','Four','Tunneling','Passing','Canine','Dog','Hound','Drill','Spinning','Twin','Dual','Hunt','Hunter','Sprint','Speed','Charge','Rush','Impact','Slam'] },

  { id:'KS-151-M', num:151, r:M_PREFIXES,
    names:['RockLee','Rock_Lee','Lee','Rock'],
    priority: ['Loopy','Loopy_Fist','Drunken','Drunken_Fist','Suiken','Sake','Drunk','Intoxicated','Zuiken','Hidden_Lotus','Inner_Gate','Fifth_Gate','Eight_Gate','Lotus','Primary_Lotus','Reverse_Lotus','Front_Lotus','Rear_Lotus','Taijutsu','Youth','Fist','Speed','Whirlwind','Leaf_Whirlwind','Weights','Dropped_Weights','True_Speed','Stagger','Stumble','Unpredictable','Erratic','Chaotic','Dancing','Leaf_Hurricane','Hurricane','Dynamic_Entry','Entry','Kick','Punch','Strike','Barrage','Flurry','Ura_Renge','Omote_Renge','Morning_Peacock','Peacock','Gate','Gates'],
    combo: ['Loopy','Fist','Drunken','Drunk','Sake','Suiken','Zuiken','Hidden','Lotus','Inner','Gate','Gates','Fifth','Eight','Primary','Reverse','Front','Rear','Taijutsu','Youth','Speed','Whirlwind','Leaf','Weights','True','Stagger','Stumble','Dancing','Hurricane','Dynamic','Entry','Kick','Punch','Strike','Barrage','Flurry','Peacock','Morning'] },

  { id:'KS-152-M', num:152, r:M_PREFIXES,
    names:['Itachi','Itachi_Uchiha','ItachiUchiha','Uchiha','Uchiha_Itachi'],
    priority: ['Amaterasu','Black_Flame','Black_Flames','Flames','Mangekyo','Mangekyou','Mangekyo_Sharingan','Sharingan','Eternal','Susanoo','Tsukuyomi','Genjutsu','Fire','Katon','Fireball','Burning','Inextinguishable','Divine','Crow','Crows','Raven','Hunting','Akatsuki','Control','Izanami','Izanagi','Massacre','Prodigy','Genius','Inferno','Blaze','Scorch','Totsuka','Yata','Blade','Shield','Sword_of_Totsuka','Yata_Mirror','Dark_Fire','Shadow_Fire','Nightmare','Moon_Reader','Eternal_Flame','Perpetual','Everlasting'],
    combo: ['Amaterasu','Black','Flame','Flames','Mangekyo','Sharingan','Eternal','Susanoo','Tsukuyomi','Genjutsu','Fire','Burning','Divine','Crow','Crows','Raven','Hunting','Control','Inferno','Blaze','Scorch','Totsuka','Yata','Blade','Shield','Sword','Mirror','Dark','Shadow','Nightmare','Moon','Reader'] },

  { id:'KS-153-M', num:153, r:M_PREFIXES,
    names:['Gaara','Gaara_of_the_Sand','Sabaku_no_Gaara','Sabaku'],
    priority: ['Sand_Burial','Sand_Coffin','Sand_Funeral','Sabaku','Sabaku_Soso','Sabaku_Kyuu','Sabaku_Taiso','Desert_Coffin','Desert_Funeral','Desert','Sand_Waterfall','Sand_Tsunami','Sand_Avalanche','Imperial_Funeral','Quicksand','Kazekage','Absolute','Shield','Sand','Burial','Funeral','Coffin','Sand_Armor','Sand_Prison','Sand_Storm','Crushing','Tomb','Sand_Cocoon','Desert_Prison','Desert_Tomb','Sand_Tomb','Sand_Grave','Sand_Cascade','Sand_Flow','Engulf','Swallow','Devour','Capture','Encase','Sand_Wave'],
    combo: ['Sand','Burial','Coffin','Funeral','Sabaku','Soso','Kyuu','Taiso','Desert','Waterfall','Tsunami','Avalanche','Imperial','Quicksand','Kazekage','Absolute','Shield','Armor','Prison','Storm','Crushing','Tomb','Grave','Cocoon','Cascade','Flow','Wave','Engulf','Swallow','Capture','Encase'] },
];

// ─── URL GENERATORS ──────────────────────────────────────────────
const WIDTHS = ['-1920w','-1280w','-960w','-640w','-480w','-1600w','-2048w','-2560w',''];

function genPhase1_Dictionary(card) {
  // Try ALL dictionary words as single-word title, focused on -1920w only
  const urls = new Set();
  const nums = [String(card.num), String(card.num).padStart(2,'0'), String(card.num).padStart(3,'0')];
  const topNames = card.names.slice(0,3);
  for (const n of nums) {
    for (const r of card.r) {
      for (const name of topNames) {
        for (const word of DICTIONARY) {
          urls.add(`${BASE}${n}_${r}_${name}_${word}-1920w.webp`);
          // Lowercase variant
          urls.add(`${BASE}${n}_${r}_${name}_${word.toLowerCase()}-1920w.webp`);
          // No separator variant (ShadowSnake instead of Shadow_Snake)
          urls.add(`${BASE}${n}_${r}_${name}${word}-1920w.webp`);
        }
        // Name only, no title at all (like 108_M_Naruto)
        urls.add(`${BASE}${n}_${r}_${name}-1920w.webp`);
      }
    }
  }
  return [...urls].filter(u => !testedSet.has(u));
}

function genPhase2_Priority(card) {
  // Priority titles with full width expansion
  const urls = new Set();
  const nums = [String(card.num), String(card.num).padStart(2,'0'), String(card.num).padStart(3,'0')];
  for (const b of [BASE, BASE2]) {
    for (const n of nums) {
      for (const r of card.r) {
        for (const name of card.names) {
          for (const t of card.priority) {
            for (const w of WIDTHS) {
              urls.add(`${b}${n}_${r}_${name}_${t}${w}.webp`);
              urls.add(`${b}${n}_${r}_${name}-${t}${w}.webp`); // Kabuto hyphen style
              // Lowercase full path
              urls.add(`${b}${n}_${r}_${name}_${t.toLowerCase()}${w}.webp`);
            }
            // jpg/png for -1920w
            urls.add(`${b}${n}_${r}_${name}_${t}-1920w.jpg`);
            urls.add(`${b}${n}_${r}_${name}_${t}-1920w.png`);
          }
          // No title
          for (const w of WIDTHS) {
            urls.add(`${b}${n}_${r}_${name}${w}.webp`);
          }
        }
      }
      // === NEW: reversed name-title order ===
      for (const r of card.r.slice(0,3)) {
        for (const t of card.priority.slice(0,15)) {
          for (const name of card.names.slice(0,2)) {
            urls.add(`${BASE}${n}_${r}_${t}_${name}-1920w.webp`);
          }
        }
      }
      // === NEW: no rarity prefix ===
      for (const name of card.names.slice(0,3)) {
        for (const t of card.priority.slice(0,20)) {
          urls.add(`${BASE}${n}_${name}_${t}-1920w.webp`);
          urls.add(`${BASE}${n}_${name}-1920w.webp`);
        }
      }
    }
  }
  return [...urls].filter(u => !testedSet.has(u));
}

function genPhase3_Combos(card) {
  // All combinatorial pairs from combo word pool (A_B)
  const urls = new Set();
  const n = String(card.num).padStart(card.num < 100 ? 2 : 0, '0') || String(card.num);
  const nums = [String(card.num), String(card.num).padStart(2,'0')];
  if (card.num >= 100) nums.push(String(card.num));
  const topR = card.r.slice(0,4);
  const topNames = card.names.slice(0,2);

  for (const numStr of [...new Set(nums)]) {
    for (const r of topR) {
      for (const name of topNames) {
        for (const w1 of card.combo) {
          for (const w2 of card.combo) {
            if (w1 === w2) continue;
            const title = `${w1}_${w2}`;
            urls.add(`${BASE}${numStr}_${r}_${name}_${title}-1920w.webp`);
          }
        }
      }
    }
  }
  return [...urls].filter(u => !testedSet.has(u));
}

// ─── DETAILED LOGGING ────────────────────────────────────────────
function elapsed() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m${String(sec).padStart(2,'0')}s`;
}

function rateStr() {
  const s = (Date.now() - startTime) / 1000;
  return s > 0 ? `${Math.round(totalNew / s)}/s` : '0/s';
}

// ─── WORKER ──────────────────────────────────────────────────────
async function runPhase(card, phaseName, urls, foundSet, stats) {
  if (foundSet.has(card.id)) return;
  if (!urls.length) {
    console.log(`  [${card.id}] ${phaseName}: 0 new URLs (all previously tested)`);
    return;
  }
  console.log(`  [${card.id}] ${phaseName}: ${urls.length.toLocaleString()} new URLs to test`);

  let phaseFound = false;
  let phaseTested = 0;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    if (interrupted || foundSet.has(card.id)) return;
    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(head));

    for (const r of results) {
      testedSet.add(r.url);
      totalNew++;
      phaseTested++;

      if (r.s === 200 && r.sz > MIN_SIZE) {
        const fn = r.url.split('/').pop();
        console.log('');
        console.log(`  ╔══════════════════════════════════════════════════════════════╗`);
        console.log(`  ║  FOUND!  ${card.id}                                        ║`);
        console.log(`  ║  File: ${fn}`);
        console.log(`  ║  Size: ${(r.sz/1024).toFixed(1)} KB`);
        console.log(`  ║  URL:  ${r.url}`);
        console.log(`  ╚══════════════════════════════════════════════════════════════╝`);
        console.log('');

        const ext = path.extname(fn).split('-')[0] || '.webp';
        const dest = path.join(OUT, `${card.id}.webp`);
        try {
          await download(r.url, dest);
          const s = fs.statSync(dest);
          console.log(`  [${card.id}] Downloaded: ${(s.size/1024).toFixed(1)} KB -> ${dest}`);
          found.push({ cardId: card.id, url: r.url, size: s.size, fn });
          foundSet.add(card.id);
          phaseFound = true;
          stats.f++;
        } catch(e) { console.log(`  [${card.id}] Download FAILED: ${e.message}`); }
        saveProgress();
        return;
      }
    }

    // Progress every 5 batches
    if ((i / CONCURRENCY) % 5 === 4) {
      const pct = Math.round((i / urls.length) * 100);
      process.stdout.write(`  [${card.id}] ${phaseName}: ${pct}% (${phaseTested.toLocaleString()}/${urls.length.toLocaleString()}) | Total: ${totalNew.toLocaleString()} | ${rateStr()} | ${elapsed()}   \r`);
    }

    await sleep(DELAY_MS);
  }

  if (!phaseFound) {
    console.log(`  [${card.id}] ${phaseName}: DONE - not found (tested ${phaseTested.toLocaleString()} new URLs)`);
  }
}

async function workCard(card, foundSet, stats) {
  if (foundSet.has(card.id)) {
    console.log(`  [SKIP] ${card.id} — already found`);
    return;
  }

  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  SEARCHING: ${card.id.padEnd(32)}│`);
  console.log(`  │  Names: ${card.names.slice(0,3).join(', ').substring(0,35).padEnd(35)}│`);
  console.log(`  │  Rarity prefixes: ${card.r.length}                        │`);
  console.log(`  └─────────────────────────────────────────────┘`);

  // Phase 1: Dictionary enumeration
  const p1 = genPhase1_Dictionary(card);
  await runPhase(card, 'PHASE1-DICT', p1, foundSet, stats);
  if (foundSet.has(card.id)) return;

  // Phase 2: Priority titles with full expansion
  const p2 = genPhase2_Priority(card);
  await runPhase(card, 'PHASE2-PRIORITY', p2, foundSet, stats);
  if (foundSet.has(card.id)) return;

  // Phase 3: Combinatorial pairs
  const p3 = genPhase3_Combos(card);
  await runPhase(card, 'PHASE3-COMBOS', p3, foundSet, stats);

  if (!foundSet.has(card.id)) {
    console.log(`  [${card.id}] ALL PHASES COMPLETE — NOT FOUND`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        BRUTE9-OMEGA: 19 cards x 1350 concurrent              ║');
  console.log('║        Dictionary + Priority + Combinatorial Pairs            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  NEW vs brute7/brute8 (runs IN PARALLEL with them):           ║');
  console.log('║  - 350+ dictionary words as single-word titles                ║');
  console.log('║  - All combinatorial A_B word pairs per card                  ║');
  console.log('║  - Lowercase + no-separator variants                          ║');
  console.log('║  - Reversed name-title order                                  ║');
  console.log('║  - No-rarity-prefix patterns                                  ║');
  console.log('║  - 1350 concurrent (3x brute8)                                ║');
  console.log('║  - Only skips brute6 URLs (brute7+8 run at same time)         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('[INIT] Loading previously tested URLs...');
  loadTested();

  const foundSet = new Set(found.map(f => f.cardId));
  const stats = { f: found.length };

  // Count total new URLs per card
  console.log('\n[INIT] Estimating URL counts per card...');
  let grandTotal = 0;
  for (const card of CARDS) {
    const p1 = genPhase1_Dictionary(card).length;
    const p2 = genPhase2_Priority(card).length;
    const p3 = genPhase3_Combos(card).length;
    const total = p1 + p2 + p3;
    grandTotal += total;
    console.log(`  ${card.id}: ${total.toLocaleString()} new URLs (dict:${p1.toLocaleString()} + priority:${p2.toLocaleString()} + combos:${p3.toLocaleString()})`);
  }
  console.log(`\n[INIT] GRAND TOTAL: ${grandTotal.toLocaleString()} new URLs to test`);
  console.log(`[INIT] Estimated time at 1350 concurrent: ~${Math.ceil(grandTotal / 1350 * 0.15 / 60)} minutes`);
  console.log('\n[START] Launching all 19 workers in parallel...\n');

  // Launch all 19 workers in parallel
  await Promise.all(CARDS.map(c => workCard(c, foundSet, stats)));

  saveProgress();

  // ─── FINAL REPORT ──────────────────────────────────────────────
  const allFound = [
    { cardId:'KS-108-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/108_R_Naruto_Rasengan-1920w.webp' },
    { cardId:'KS-112-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/112_R_Choji_Chili_Pepper-1920w.webp' },
    { cardId:'KS-128-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/128_R_Itachi_Control-1920w.webp' },
    { cardId:'KS-145-M', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/145_M_Naruto_Original_Team-1920w.webp' },
    ...found.map(f => ({ cardId: f.cardId, url: f.url }))
  ];
  const seen = new Set();
  const uniq = allFound.filter(f => { if (seen.has(f.cardId)) return false; seen.add(f.cardId); return true; });

  fs.writeFileSync(path.join(OUT, 'found_missing_urls.txt'),
    uniq.map(f => `${f.cardId} | ${f.url}`).join('\n') + '\n');

  const missing = CARDS.filter(c => !seen.has(c.id));
  fs.writeFileSync(path.join(OUT, 'not_found_cards.txt'),
    `Cards NOT found on CDN (brute-force across 9 scripts, ${testedSet.size.toLocaleString()}+ URLs tested):\n\n` +
    missing.map(c => `${c.id} — ${c.names[0]}`).join('\n') +
    `\n\n${missing.length} cards remaining.\n`);

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    BRUTE9 FINAL REPORT                        ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Duration:        ${elapsed().padEnd(43)}║`);
  console.log(`║  New URLs tested: ${totalNew.toLocaleString().padEnd(43)}║`);
  console.log(`║  Total tested:    ${testedSet.size.toLocaleString().padEnd(43)}║`);
  console.log(`║  Avg rate:        ${rateStr().padEnd(43)}║`);
  console.log(`║  New found:       ${stats.f.toString().padEnd(43)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');

  if (found.length > 0) {
    console.log('║  FOUND IMAGES:                                                ║');
    for (const f of found) {
      console.log(`║    ${f.cardId} -> ${f.fn || f.url}`);
    }
  } else {
    console.log('║  No new images found in this run.                             ║');
  }

  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  STILL MISSING (${missing.length}):`.padEnd(65) + '║');
  for (const c of missing) {
    console.log(`║    ${c.id} — ${c.names[0]}`.padEnd(65) + '║');
  }
  console.log('╚════════════════════════════════════════════════════════════════╝');

  fs.writeFileSync(path.join(OUT, 'brute9_report.txt'),
    `BRUTE9-OMEGA REPORT\n` +
    `Duration: ${elapsed()}\n` +
    `New URLs tested: ${totalNew.toLocaleString()}\n` +
    `Total URLs tested (all scripts): ${testedSet.size.toLocaleString()}\n` +
    `Rate: ${rateStr()}\n` +
    `Found: ${stats.f}\n\n` +
    (found.length ? 'FOUND:\n' + found.map(f => `  ${f.cardId} -> ${f.url}`).join('\n') + '\n' : 'No new images found.\n') +
    '\nSTILL MISSING:\n' + missing.map(c => `  ${c.id} — ${c.names[0]}`).join('\n') + '\n');

  console.log(`\nFiles updated: found_missing_urls.txt, not_found_cards.txt, brute9_report.txt`);
}

process.on('SIGINT', () => {
  console.log('\n\n[INTERRUPT] Saving progress...');
  interrupted = true;
  saveProgress();
  setTimeout(() => process.exit(0), 1500);
});

main().catch(e => { console.error('[FATAL]', e); saveProgress(); process.exit(1); });
