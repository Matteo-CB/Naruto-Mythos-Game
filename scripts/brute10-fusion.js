/**
 * BRUTE10-FUSION — The Ultimate Merged Brute-Force
 * Fuses ALL patterns from brute7 + brute8 + brute9
 * 4050 concurrent | 19 cards | 5 phases per card | Live dashboard
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// ═══════════════════ CONFIG ═══════════════════
const CC = 4050;
const TIMEOUT = 5000;
const MIN_SZ = 5000;
const BASES = [
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/KS_',
  'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/Set1_',
];
const B = BASES[0];
const W_ALL = ['-1920w','-1280w','-960w','-640w','-480w','-1600w','-2048w','-2560w','-3840w','-384w','-256w','-128w','-3200w','-4096w',''];
const W_KEY = ['-1920w','-1280w','-960w'];
const ag = new https.Agent({ keepAlive: true, maxSockets: 4500, maxFreeSockets: 300 });
const OUT = path.join(__dirname, '..', 'newvisual');
const PROG = path.join(OUT, 'brute10_progress.json');

// ═══════════════════ STATE ═══════════════════
let tested = new Set();
let found = [];
let halt = false;
let t0 = Date.now();
// Per-card live status for dashboard
const S = {}; // S[cardId] = { phase, phaseName, tested, total, done, found }

// ═══════════════════ PROGRESS ═══════════════════
function loadAll() {
  const files = ['brute6_progress.json','brute7_progress.json','brute8_progress.json','brute9_progress.json','brute10_progress.json'];
  let total = 0;
  for (const f of files) {
    try {
      const p = path.join(OUT, f);
      if (!fs.existsSync(p)) continue;
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));
      const before = tested.size;
      (d.tested || []).forEach(u => tested.add(u));
      if (d.found) found.push(...d.found);
      const added = tested.size - before;
      if (added > 0) log(`  Loaded ${f}: +${added.toLocaleString()}`);
    } catch(e) {}
  }
  log(`  Total skip-set: ${tested.size.toLocaleString()} URLs from previous runs`);
}
function save() {
  try {
    const arr = [...tested].slice(-300000);
    fs.writeFileSync(PROG, JSON.stringify({ tested: arr, found, ts: new Date().toISOString() }));
  } catch(e) {}
}

// ═══════════════════ HTTP ═══════════════════
function head(url) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname, method: 'HEAD', timeout: TIMEOUT, agent: ag,
        headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept:'image/*', Referer:'https://www.narutotcgmythos.com/' }
      }, res => { res.resume(); resolve({ url, s: res.statusCode, z: parseInt(res.headers['content-length']||'0',10) }); });
      req.on('error', () => resolve({ url, s:0, z:0 }));
      req.on('timeout', () => { req.destroy(); resolve({ url, s:0, z:0 }); });
      req.end();
    } catch(e) { resolve({ url, s:0, z:0 }); }
  });
}
function dl(url, dest) {
  return new Promise((ok, no) => {
    const f = fs.createWriteStream(dest);
    https.get(url, { agent: ag, headers: { 'User-Agent':'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { f.close(); try{fs.unlinkSync(dest)}catch(e){} dl(res.headers.location, dest).then(ok).catch(no); return; }
      if (res.statusCode !== 200) { f.close(); try{fs.unlinkSync(dest)}catch(e){} no(new Error('HTTP '+res.statusCode)); return; }
      res.pipe(f); f.on('finish', () => { f.close(); ok(); });
    }).on('error', e => { f.close(); try{fs.unlinkSync(dest)}catch(e2){} no(e); });
  });
}

// ═══════════════════ RARITY SETS (UNION ALL) ═══════════════════
const R_ALL  = ['R','R_ART','RA','ART','Rare','Rare_Art','R-ART','R_Art','r','R_art','Rare_ART'];
const RA_ALL = ['R_ART','RA','ART','Rare_Art','R-ART','R_Art','R_ART_GOLD','r_art','R_art','Rare_ART','R_ART_Special'];
const S_ALL  = ['Secret_GOLD','SecretV_GOLD','S','Secret','SecretV','Secret_Gold','Secret_SILVER','S_GOLD','Gold','GOLD','SecretV_Gold','Secret_Special','S_Special'];
const M_ALL  = ['M','M_Special','MV','MV_Special','Mythos','M_special','Mythos_Special','M_SPECIAL','MV_GOLD','M_GOLD','M_Gold'];
const UC_ALL = ['UC','Uncommon','U','uc','C'];
const WILD   = ['C','UC','R','R_ART','RA','M','M_Special','MV','Secret_GOLD','SecretV_GOLD','S','L','Legendary'];

// ═══════════════════ DICTIONARY (350+ words from brute9) ═══════════════════
const DICT = [...new Set([
  'Professor','Hokage','Master','Reserve','Seal','Assistant','Needle','Shot','Toad','Sage','Dark','Swamp','Genin','Substitution','Chakra','Prowess','Last','Sharingan','Teacher','Expansion','Human','Boulder','Mind','Transfer','Shadow','Possession','Trench','Knives','All','Four','Hound','Man','Beast','Clone','Two','Headed','Wolf','Gentle','fist','Fist','Byakugan','Parasitic','Insects','Tree','Bind','Palm','Rotation','Training','Primary','Lotus','Weapon','Specialist','Ferocious','Proctor','Trainer','Instructor','Shinobi','Elite','Guard','Undercover','Infiltrator','Yin','Healing','Nirvana','Temple','Camelia','Dance','Shikotsumyaku','Bearer','Earth','Dome','Spider','Web','Black','Molecular','Demon','Flute','Summoning','Superhuman','Echo','Speaker','Slicing','Kunoichi','Bell','Sound','Jinchuriki','Sand','Shield','Partial','Trasformation','Threads','Puppet','Jutsu','Sandstorm','Council','Agent','Careteaker','Kubikiribocho','Orphan','Crystal','Ice','Mirrors','Akatsuki','Rogue','Ninja','Chief','Armed','Eldest','Son','Youngest','Giant','Slug','Pig','Medical','Strangle','Chili','Pepper','Loopy','Iron','Maiden','Coffin','Wind','Scythe','Control','Hunting','absorb','Rasengan','Recovery','Team','Heaven','Curse','Mark','Lightning','Blade','Transference','Ritual','Original','Transformation','Snake','Snakes','Serpent','Viper','Cobra','Python','Fang','Fangs','Claw','Claws','Insect','Bug','Bugs','Wall','Barrier','Fortress','Armor','Swarm','Colony','Hive','Beetle','Cocoon','Nest','Wave','Pillar','Eight','Trigrams','Sixty','Palms','Strike','Kaiten','Tenketsu','Juken','Vacuum','Air','Arhat','Punch','Slam','Brute','Ogre','Golem','Rock','Stone','Titan','Colossus','Drain','Siphon','Devour','Glutton','Bow','Arrow','Gold','Golden','Archer','Marksman','Sniper','Arachnid','Thread','Net','Kusanagi','Sword','Fear','Terror','Horror','Nightmare','Villain','Lord','King','Parasite','Leech','Merge','Twin','Twins','Brothers','Fusion','Split','Double','Fox','Cloak','Shroud','Aura','Red','Crimson','Rage','Fury','Berserk','Feral','Wild','Unleashed','Released','Overflow','Hatred','Malice','Possessed','Tanuki','Raccoon','Shukaku','Monster','Kaiju','Colossal','Massive','Awakened','Awakening','Awakens','Destruction','Rampage','Catastrophe','Inferno','Cataclysm','Havoc','Chaos','Ruin','Devastation','Annihilation','Roar','Bomb','Gatsuuga','Tsuga','Tunneling','Piercing','Dynamic','Drill','Spinning','Charge','Rush','Impact','Sprint','Tracking','Pursuit','Hunt','Hunter','Tracker','Nose','Drunken','Drunk','Tipsy','Suiken','Intoxicated','Stagger','Stumble','Wobbly','Hurricane','Entry','Kick','Barrage','Flurry','Combo','Taijutsu','Youth','Amaterasu','Flame','Flames','Mangekyo','Tsukuyomi','Susanoo','Genjutsu','Crow','Crows','Raven','Blaze','Ignite','Ember','Ash','Scorch','Char','Burning','Inextinguishable','Eternal','Divine','Celestial','Totsuka','Yata','Burial','Funeral','Sabaku','Desert','Quicksand','Tomb','Grave','Crushing','Engulf','Swallow','Prison','Cage','Trap','Capture','Encase','Cascade','Flow','Power','Attack','Defense','Technique','Secret','Hidden','True','Full','Complete','Ultimate','Final','Supreme','Grand','Great','Legendary','Ancient','Sacred','Forbidden','Deadly','Lethal','Fatal','Fierce','Savage','Brutal','Vicious','Mighty','Strong','Unstoppable','Invincible','Wrath','Vengeance','Oblivion','Apocalypse','Judgment','Absolute','Infinite','Immortal','Demonic','Cursed','Sealed','Branded','Marked','Corrupted','Tainted','Infected','Senei','Jashu','Kikaichuu','Kikaichu','Hakke','Rokujuyon','Tarenken','Kumoshibari','Kuchiyose','Soso','Kyuu','Taiso','Zuiken','Ombre','Mur','Insecte','Poing','Pierre','Araignee','Arc','Renard','Manteau','Sable','Cercueil','Tombeau','Crocs','Ivresse','Flamme','Version','Level','Stage','State','Mode','Form','Phase','Step','V1','V2','Level1','Level2','Powered','Charged','Enhanced','Evolved','Advanced','Superior','Primal','Beastly','Monstrous','Terrifying','Horrifying',
])];

// ═══════════════════ 19 CARDS (MERGED NAMES+TITLES) ═══════════════════
const CARDS = [
  { id:'KS-045-UC', num:45, r:UC_ALL,
    names:['Anko','Anko_Mitarashi','AnkoMitarashi','Mitarashi','Mitarashi_Anko'],
    titles:['Shadow_Snake','Snake_Hands','Shadow_Snake_Hands','Striking_Shadow','Striking_Shadow_Snakes','Striking_Snakes','Hidden_Shadow','Hidden_Shadow_Snake','Hidden_Shadow_Snake_Hands','Sen_Ei','Sen_Ei_Jashu','Senei_Jashu','Senei','Jashu','Shadow_Snake_Hand','Snake_Hand','Many_Hidden_Shadow_Snake_Hands','Proctor','Examiner','Special_Jonin','Jonin','Forest_Death','Forest_of_Death','Death_Forest','Second_Exam','Exam','Chunin_Exam','Snake','Snakes','Serpent','Serpents','Viper','Snake_Strike','Snake_Fang','Snake_Attack','Snake_Assault','Snake_Authority','Snake_Authority_Spear','Twin_Snake','Twin_Snakes','Venomous','Poison','Venom','Toxic','Cursed','Cursed_Seal','Cursed_Mark','Curse','Branded','Mark','Heaven_Seal','Seal_of_Heaven','Curse_Mark','Assassin','Ambush','Dangerous','Fierce','Deadly','Dango','Sweet_Bean','Poigne','Serpent_Spectral','Ombre','Serpent_Ombre','Shadow-Snake','Snake-Hands','Shadow-Snake-Hands','Sen-Ei-Jashu','Striking-Shadow-Snakes','shadow_snake','snake_hands','shadow_snake_hands','striking_shadow','hidden_shadow','sen_ei_jashu','Multiple_Snakes','Dual_Snake','Kunoichi','Mitarashi_Special','Snake_Bite','Bite','Fang','Fangs','Coil','Constrict','Wrap','Strangle','Hidden','Secret','Deadly_Snake','Double_Snake','Serpent_Strike','Snake_Fist','Shadow_Serpent','Spectral','Ghost_Snake','Phantom','Spirit_Snake','Snake_Jutsu','Snake_Technique','Sen_Ei_Ta_Jashu','Multiple_Hidden','Formation_of_Ten','Coiling','Summoning_Snake'],
    combo:['Shadow','Snake','Snakes','Serpent','Hands','Hand','Strike','Fang','Hidden','Striking','Sen','Ei','Jashu','Senei','Twin','Multiple','Coil','Viper','Cobra','Bite','Venom','Poison','Deadly','Branded','Cursed','Seal','Forest','Death','Special','Jonin'] },
  { id:'KS-115-R', num:115, r:R_ALL,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame','Aburame_Shino'],
    titles:['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Wall_Technique','Bug_Wall_Technique','Insect_Dome','Bug_Dome','Insect_Sphere','Bug_Sphere','Insect_Clone','Bug_Clone','Insect_Jar','Bug_Jar','Parasitic_Wall','Parasitic_Destruction','Parasitic_Insects','Hidden_Insect','Insect_Jamming','Bug_Jamming','Destruction_Host','Host_Technique','Destruction_Bug','Mushi','Kikaichuu','Kikaichu','Kikai','Swarm','Insect','Insects','Wall','Bug','Bugs','Colony','Hive','Beetle','Beetles','Bug_Shield','Bug_Barrier','Living_Wall','Insect_Armor','Bug_Armor','Bug_Swarm','Infestation','Shield','Barrier','Defense','Protection','Aburame','Aburame_Technique','Insect_Pillar','Sunglasses','Silent','Quiet','Stoic','Mur_Insectes','Technique_Mur','Insecte','insect_wall','bug_wall','insect_dome','parasitic','Insect-Wall','Bug-Wall','Bug-Dome','Bug_Host','Destruction_Colony','Secret_Technique','Insect_Shield','Insect_Swarm','Bug_Pillar','Insect_Cocoon','Cocoon','Chrysalis','Larva','Nest','Insect_Nest','Bug_Nest','Insect_Wave','Bug_Wave','Creeping','Crawling','Insect_Barrier','Insect_Fortress','Bug_Fortress','Colony_Wall','Insect_Protection','Bug_Defense','Wall_Technique'],
    combo:['Insect','Bug','Bugs','Wall','Dome','Sphere','Shield','Barrier','Armor','Swarm','Colony','Hive','Beetle','Cocoon','Nest','Wave','Pillar','Parasitic','Destruction','Host','Hidden','Secret','Technique','Kikaichuu','Kikaichu','Defense','Protection','Fortress','Living','Formation'] },
  { id:'KS-115-RA', num:115, r:RA_ALL,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame'],
    titles:['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Wall_Technique','Bug_Wall_Technique','Insect_Dome','Bug_Dome','Insect_Sphere','Bug_Sphere','Insect_Clone','Bug_Clone','Parasitic_Wall','Parasitic_Destruction','Parasitic_Insects','Hidden_Insect','Insect_Jamming','Destruction_Host','Destruction_Bug','Kikaichuu','Kikaichu','Swarm','Insect','Insects','Wall','Bug','Bugs','Colony','Hive','Beetle','Bug_Shield','Bug_Barrier','Insect_Armor','Bug_Armor','Bug_Swarm','Shield','Barrier','Aburame','Insect_Pillar','insect_wall','bug_wall','Insect-Wall','Bug-Wall','Secret_Technique','Insect_Shield','Insect_Nest','Cocoon','Insect_Wave','Insect_Barrier','Insect_Fortress','Colony_Wall','Insect_Swarm','Insect_Cocoon'],
    combo:['Insect','Bug','Wall','Dome','Shield','Barrier','Armor','Swarm','Colony','Hive','Beetle','Cocoon','Parasitic','Destruction','Host','Hidden','Secret','Technique','Kikaichuu','Formation'] },
  { id:'KS-116-RA', num:116, r:RA_ALL,
    names:['Neji','Neji_Hyuga','NejiHyuga','Hyuga','Hyuga_Neji'],
    titles:['Eight_Trigrams','Sixty-Four_Palms','Sixty_Four_Palms','Eight_Trigrams_64','Eight_Trigrams_Sixty-Four','Hakke_64','Hakke_Rokujuyon','Hakke','Rokujuyon','64_Palms','64_palms','64_Palms_Strike','Gentle_Step','Gentle_fist','Gentle_Fist','Palm_Rotation','Rotation','Byakugan','Air_Palm','Vacuum_Palm','Divination','Guardian','Prodigy','Hyuga_Prodigy','Destiny','Fate','Cage','Caged_Bird','Branch_House','Main_House','Seal','Genius','Gifted','Talented','Prodigal','Trigrams','Palms','Strike','Soixante-Quatre','Hakke_Paumes','Paumes','eight_trigrams','sixty_four_palms','gentle_fist','Eight-Trigrams','Sixty-Four-Palms','Sixty-Four','Eight-Trigrams-64','Sixty_Four','SixtyFour_Palms','Palms_Strike','All_Seeing','White_Eye','360','Full_View','Heavenly_Spin','Kaiten','Palm_Bottom','Tenketsu','Chakra_Points','Juken','Juuken'],
    combo:['Eight','Trigrams','Sixty','Four','Palms','Palm','Rotation','Gentle','Fist','fist','Byakugan','Air','Vacuum','Divination','Prodigy','Destiny','Hakke','Strike','Kaiten','Tenketsu','Juken','Heavenly','Spin','White','Eye','All','Seeing','64','View','Bottom','Chakra','Points'] },
  { id:'KS-122-R', num:122, r:R_ALL,
    names:['Jirobo','Jiroubou','Jirobou','Jirôbô','Jiroubô'],
    titles:['Arhat','Arhat_Fist','Arhat_fist','arhat_fist','Earth_Dome','Earth_Prison','Earth_Barrier','Absorbing_Barrier','Chakra_Drain','Absorbing','Absorption','Earth_Sphere','Sphere','Barrier','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Stage_Two','Stage_2','Transformation','Transformation_Level_2','Full_Power','Sound_Four','Sound_Ninja','Bearer','Ogre','Golem','Rock','Boulder','Giant','Fist','Power','Punch','Slam','Strength','Body_Slam','Brute','Brute_Force','Rage','Poing','Arhat_Poing','Dôme_Terre','arhat','cursed_seal','earth_dome','fist','Arhat-Fist','Cursed-Seal','Earth-Prison','Earth-Dome','Level-Two','Sound-Four','Awakened','Powered_Up','Dark_Power','Seal_Release','Monster','Hulk','Titan','Colossus','Smash','Ground_Pound','Earth_Fist','Stone_Fist','Stone','Earth','Chakra_Absorb','Drain','Siphon','Devour','Consume','Glutton','Hungry','Feast'],
    combo:['Arhat','Fist','Earth','Dome','Prison','Barrier','Absorb','Drain','Chakra','Cursed','Seal','Level','Two','Power','Full','Giant','Ogre','Golem','Stone','Punch','Slam','Brute','Rage','Monster','Titan','Hulk','Smash','Ground','Pound','Body','Dark','Awakened'] },
  { id:'KS-122-RA', num:122, r:RA_ALL,
    names:['Jirobo','Jiroubou','Jirobou'],
    titles:['Arhat','Arhat_Fist','arhat_fist','Earth_Dome','Earth_Prison','Earth_Barrier','Absorbing_Barrier','Chakra_Drain','Absorbing','Absorption','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Full_Power','Sound_Four','Ogre','Golem','Boulder','Giant','Fist','Power','Punch','Slam','Brute','Rage','arhat','cursed_seal','earth_dome','Arhat-Fist','Cursed-Seal','Earth-Prison','Monster','Titan','Earth_Fist','Stone_Fist','Stone','Earth','Chakra_Absorb','Drain','Glutton','Feast','Awakened','Dark_Power','Powered_Up'],
    combo:['Arhat','Fist','Earth','Dome','Prison','Barrier','Cursed','Seal','Level','Power','Giant','Ogre','Stone','Punch','Brute','Rage','Monster','Titan','Awakened','Dark','Drain'] },
  { id:'KS-124-R', num:124, r:R_ALL,
    names:['Kidomaru','Kidoumaru','Kidômaru'],
    titles:['Spider_Bow','Fierce_Rip','Spider_Bow_Fierce','Spider_Sticky','Spider_Sticky_Gold','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Kumoshibari','Kumo','Spider_Thread','Spider_Net','Spider_Web','Web','Spider','Thread','Cursed_Seal','Level_Two','Level_2','Second_State','Stage_Two','Sound_Four','Sound_Ninja','Bearer','Archer','Hunter','Predator','Third_Eye','Six_Arms','Arms','Sticky','Golden','Gold','Armor','Cocoon','Arc_Araignee','Araignee','Dechirure','spider_bow','fierce_rip','gold_arrow','spider_web','Spider-Bow','Fierce-Rip','Gold-Arrow','War-Bow','Spider-Web','Spider-Thread','Marksman','Sniper','Projectile','Shot','Shoot','Target','Aim','Precision','Long_Range','Ranged','Sticky_Gold','Web_Armor','Spider_Armor','Arachnid','Eight_Legs','Multi_Arm','Six_Arm','Kawarimi','Strategy','Tactical'],
    combo:['Spider','Bow','Fierce','Rip','Gold','Golden','Arrow','War','Web','Thread','Net','Cursed','Seal','Level','Archer','Hunter','Eye','Third','Six','Arms','Arm','Sticky','Cocoon','Marksman','Sniper','Shot','Arachnid','Armor','Precision','Target','Aim','Long','Range'] },
  { id:'KS-124-RA', num:124, r:RA_ALL,
    names:['Kidomaru','Kidoumaru'],
    titles:['Spider_Bow','Fierce_Rip','Spider_Bow_Fierce','Spider_Sticky','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Kumoshibari','Spider_Thread','Spider_Net','Spider_Web','Web','Spider','Cursed_Seal','Level_Two','Second_State','Sound_Four','Archer','Hunter','Third_Eye','Six_Arms','Sticky','Golden','Gold','Cocoon','spider_bow','fierce_rip','gold_arrow','Spider-Bow','Fierce-Rip','Gold-Arrow','Marksman','Sniper','Projectile','Arachnid','Spider_Armor','Ranged'],
    combo:['Spider','Bow','Fierce','Rip','Gold','Golden','Arrow','War','Web','Thread','Cursed','Seal','Archer','Hunter','Eye','Six','Arms','Sticky','Cocoon','Sniper','Armor'] },
  { id:'KS-126-R', num:126, r:R_ALL,
    names:['Orochimaru'],
    titles:['Summoning','Summoning_Jutsu','Snake_Summoning','Manda','Manda_Summoning','Giant_Snake','Triple_Rashomon','Rashomon','Formation','Kusanagi','Grass_Cutter','Sword','Blade','Grass_Long_Sword','Five_Pronged_Seal','Five_Pronged','Living_Corpse','Body_Transfer','Transference','Edo_Tensei','Reanimation','Snake','Snake_Lord','Snake_Master','Sannin','Fear','Intimidation','Fury','Wrath','Threat','Confrontation','Attack','Assault','Power','Immortal','Forbidden','True_Form','True_Power','Villain','Invasion','Forest','Eight_Headed','Yamata','White_Snake','Get_Out','Out_of_Way','Blocked','Obstacle','Sound','Otokage','Lord','Unstoppable','Path','Way','Rage','Move','Force','Domination','Overwhelming','Chemin','Otez','Invocation','summoning','manda','kusanagi','snake','Snake-Summoning','Giant-Snake','Five-Pronged-Seal','Get-Out','Living-Corpse','Body-Transfer','White-Snake','True-Form','Triple-Rashomon','Tongue','Shed','Rebirth','Immortality','Experiment','Lab','Science','Jutsu','Ninjutsu','Kinjutsu','Sacrifice','Soul','Curse','Heaven','Seal','Branded','Terror','Horror','Nightmare','Shadow','Darkness','Evil','Ambition','Power_Hungry','Desire','Greed','Knowledge','Forbidden_Jutsu','Kuchiyose','Impure','World','Dead','Undead'],
    combo:['Summoning','Snake','Manda','Giant','Rashomon','Kusanagi','Sword','Blade','Fear','Terror','Wrath','Fury','Power','Immortal','Forbidden','True','Form','White','Lord','Master','Sannin','Invasion','Evil','Dark','Darkness','Shadow','Curse','Heaven','Seal','Branded','Living','Corpse','Body','Transfer','Tongue','Shed','Rebirth','Experiment','Sacrifice'] },
  { id:'KS-127-R', num:127, r:R_ALL,
    names:['Sakon','Sakon_Ukon','SakonUkon','Ukon','Ukon_Sakon'],
    titles:['Stone_Fist','Stone_fist','stone_fist','Tarenken','Multiple_Fist','Multiple_Connected_Fist','Parasite','Demon_Parasite','Parasitic','Molecular_Possession','Possession','Black_Seal','Seal','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Stage_Two','Merge','Combined','Combination','Fusion','Ukon_Merge','Ukon','Twin','Twins','Brothers','Sound_Four','Sound_Ninja','Bearer','Combined_Attack','Punch','Fist','Power','Demon','Ogre','Monster','Rashomon','Poing_Pierre','Pierre','cursed_seal','merge','tarenken','Stone-Fist','Cursed-Seal','Combined-Attack','Multiple-Fist','Demon-Parasite','Attach','Leech','Absorb','Infect','Host','Body','Inside','Inhabit','Infiltrate','Split','Separate','Together','Duo','Pair','Double','Merged','United','Conjoined','Connected','Linked'],
    combo:['Stone','Fist','Tarenken','Multiple','Parasite','Demon','Parasitic','Molecular','Possession','Black','Seal','Cursed','Level','Merge','Combined','Fusion','Twin','Twins','Brothers','Punch','Monster','Leech','Absorb','Host','Body','Split','Duo','Pair','Double','Merged','Connected','Ukon','Attack'] },
  { id:'KS-127-RA', num:127, r:RA_ALL,
    names:['Sakon','Sakon_Ukon','Ukon'],
    titles:['Stone_Fist','Stone_fist','Tarenken','Multiple_Fist','Parasite','Demon_Parasite','Parasitic','Molecular_Possession','Possession','Black_Seal','Cursed_Seal','Level_Two','Second_State','Merge','Combined','Fusion','Ukon','Twin','Sound_Four','Punch','Fist','Demon','Monster','stone_fist','cursed_seal','Stone-Fist','Cursed-Seal','Attach','Leech','Host','Body','Split','Together','Duo','Pair','Merged','Connected'],
    combo:['Stone','Fist','Tarenken','Multiple','Parasite','Demon','Molecular','Possession','Black','Seal','Cursed','Merge','Fusion','Twin','Punch','Monster','Leech','Host','Body','Split','Duo','Merged','Ukon'] },
  { id:'KS-129-R', num:129, r:[...R_ALL,...M_ALL],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Naruto','Naruto_Kyubi','Naruto_Fox','Naruto_Uzumaki','Kurama','Fox','Demon_Fox'],
    titles:['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Red_Aura','Tailed_Cloak','Chakra_Cloak','Bijuu_Cloak','Jinchuuriki','Jinchuriki','Partial_Trasformation','Partial_Transformation','Version_1','V1','Initial','Awakening','One_Tail_Cloak','One-Tail_Cloak','Tail','Fox','Demon','Red','Rage','Rampage','Beast','Beast_Cloak','Demon_Mantle','Fury','Berserk','Feral','Wild','Power','Unleashed','Released','Uncontrolled','Chakra','Red_Chakra_Cloak','Crimson','Seal','Broken_Seal','Seal_Break','Nine-Tails_Cloak','Nine-Tails-Cloak','Tailed_Beast','Renard','Manteau','Demon_Renard','demon_fox','fox_cloak','red_chakra','jinchuriki','Demon-Fox','Fox-Cloak','Red-Chakra','Bijuu-Cloak','Beast-Cloak','One_Tail','Two_Tails','Cloak_V1','Initial_Form','Shroud','Red_Shroud','Chakra_Shroud','Aura','Malice','Hatred','Dark_Chakra','Frenzy','Berserker','Possessed','Controlled','Overflow','Leak','Seal_Weakening'],
    combo:['Demon','Fox','Cloak','Red','Chakra','Aura','Shroud','Beast','Rage','Fury','Berserk','Feral','Wild','Unleashed','Released','Seal','Broken','Tailed','Nine','Tails','Partial','Trasformation','Transformation','V1','Version','Initial','Mode','Crimson','Dark','Overflow','Possessed','Jinchuriki','Bijuu','Kurama'] },
  { id:'KS-129-RA', num:129, r:[...RA_ALL,...M_ALL],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','Naruto','Naruto_Kyubi','Kurama','Fox','Demon_Fox'],
    titles:['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Red_Aura','Bijuu_Cloak','Jinchuuriki','Jinchuriki','Partial_Trasformation','Partial_Transformation','Version_1','V1','Fox','Demon','Red','Rage','Beast','Beast_Cloak','Fury','Berserk','Unleashed','Chakra','Crimson','Seal','Tailed_Beast','demon_fox','fox_cloak','Demon-Fox','Fox-Cloak','Red-Chakra','Shroud','Red_Shroud','Aura','Frenzy','Possessed','Overflow'],
    combo:['Demon','Fox','Cloak','Red','Chakra','Aura','Shroud','Beast','Rage','Fury','Berserk','Wild','Unleashed','Seal','Tailed','Partial','Trasformation','Crimson','Dark','Possessed','Bijuu','Kurama'] },
  { id:'KS-130-R', num:130, r:[...R_ALL,...M_ALL],
    names:['One-Tail','One_Tail','OneTail','Ichibi','Gaara','Gaara_Shukaku','Shukaku','Gaara_One-Tail','Gaara_Ichibi'],
    titles:['Full_Trasformation','Complete_Trasformation','Full_Transformation','Complete_Transformation','Trasformation','Transformation','Sand_Monster','Full_Beast','Sand_Demon','Tanuki','Transform','Beast','Monster','Sand_Spirit','Guardian_Spirit','Spirit','Shukaku','Full_Shukaku','Awakened','Possesion','Possession','Possessed','Die','Ready_to_Die','Death','Kill','Full','Demon','Jinchuuriki','Jinchuriki','Sand','Sand_Form','Sand_Beast','Sand_Tanuki','Rampage','Berserk','Unleashed','Released','Giant','Colossal','Kaiju','Transformation_Complete','Monstre_Sable','full_trasformation','full_transformation','sand_monster','Full-Trasformation','Full-Transformation','Sand-Monster','Sand-Beast','Sand-Demon','Full-Beast','One-Tail_Full','One-Tail_Complete','Partial_Trasformation','Complete','Total','Ultimate','Final_Form','Berserker','Rage','Fury','Madness','Insanity','Wild','Uncontrolled','Sand_Golem','Golem','Sand_Giant','Raccoon','Raccoon_Dog','Bijuu','Tailed_Beast'],
    combo:['Full','Trasformation','Transformation','Complete','Sand','Monster','Beast','Demon','Tanuki','Shukaku','Awakened','Possessed','Possession','Giant','Colossal','Golem','Raccoon','Bijuu','Tailed','Rampage','Berserk','Unleashed','Fury','Madness','Wild','Die','Ready','Death','Kaiju','Form','Final'] },
  { id:'KS-134-S', num:134, r:S_ALL,
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Nine-Tailed_Fox','Nine_Tailed_Fox','NineTailed','Fox','Naruto','Kurama','Demon_Fox','Bijuu','Naruto_Kyubi','Naruto_Fox','Naruto_Uzumaki'],
    titles:['Beast_Awakens','Awakens','Awakening','Destruction','Giant_Fox','Full_Power','Unleashed','Bijuu','Demon_Fox','Tailed_Beast','Berserk','Rampage','Roar','Rage','Beast_Bomb','Bijuu_Bomb','Bijuudama','Full_Beast','Beast','Fox','Giant','Power','Awakened','Released','Unbound','Free','Nine_Tails','Tails','Demon','Monster','Kaiju','Colossal','Massive','Overwhelming','Seal_Break','Broken_Seal','Seal_Released','Rasengan','Fury','Wrath','Eveil','Destruction_Bete','Renard','beast_awakens','destruction','awakening','giant_fox','Beast-Awakens','Full-Power','Demon-Fox','Giant-Fox','Tailed-Beast','Bijuu-Bomb','Catastrophe','Apocalypse','Armageddon','Devastation','Annihilation','Havoc','Chaos','Ruin','Inferno','Hellfire','Cataclysm','Explosion','Blast','Shockwave','Tremor','Earthquake'],
    combo:['Beast','Awakens','Awakening','Destruction','Giant','Fox','Full','Power','Unleashed','Demon','Tailed','Berserk','Rampage','Roar','Rage','Bomb','Bijuu','Released','Free','Monster','Kaiju','Seal','Break','Broken','Fury','Wrath','Catastrophe','Havoc','Chaos','Explosion','Blast','Inferno','Nine','Tails'] },
  { id:'KS-149-M', num:149, r:M_ALL,
    names:['Kiba','Kiba_Inuzuka','KibaInuzuka','Inuzuka','Inuzuka_Kiba','Kiba_Akamaru'],
    titles:['Fang','Fang_Over_Fang','Fang_over_Fang','Double_Fang','Gatsuuga','Gatsuga','Tsuga','Two-Headed','Two-Headed_Wolf','Two_Headed_Wolf','Man_Beast','Man_Beast_Clone','Beast_Clone','Wild','Wild_Fang','Piercing','Dynamic','Double','Wolf','Wolves','Pack','Akamaru','Duo','Combo','Partner','All_Four','All_Fours','All_Four_Legs','Tunneling','Tunneling_Fang','Passing_Fang','Beast','Canine','Dog','Hound','Rotation','Spinning','Drill','Claw','Crocs','Crocs_sur_Crocs','Loup','fang','fang_over_fang','gatsuuga','double_fang','Fang-Over-Fang','Two-Headed-Wolf','Man-Beast','Man-Beast-Clone','Wild-Fang','Tunneling-Fang','Twin_Fang','Dual_Fang','Inuzuka','Inuzuka_Style','Beast_Mimicry','Imitation','Clone','Transformation','Dynamic_Marking','Marking','Tracking','Nose','Scent','Smell','Hunt','Hunter','Tracker','Pursuit','Chase','Sprint','Speed','Charge','Rush','Impact','Collision','Ram','Slam'],
    combo:['Fang','Over','Double','Gatsuuga','Gatsuga','Tsuga','Two','Headed','Wolf','Man','Beast','Clone','Wild','Dynamic','Pack','Duo','Combo','All','Four','Tunneling','Passing','Canine','Dog','Hound','Drill','Spinning','Twin','Dual','Hunt','Hunter','Sprint','Speed','Charge','Rush','Impact','Slam'] },
  { id:'KS-151-M', num:151, r:M_ALL,
    names:['RockLee','Rock_Lee','Lee','Rock','RockLee_'],
    titles:['Loopy','Loopy_Fist','Loopy_fist','Drunken','Drunken_Fist','Drunken_fist','Suiken','Sake','Drunk','Intoxicated','Tipsy','Zui','Zui_Ken','Zuiken','Hidden_Lotus','Inner_Gate','Fifth_Gate','Eight_Gate','Gate','Lotus','Gates','Primary_Lotus','Reverse_Lotus','Front_Lotus','Rear_Lotus','Training','Taijutsu','Youth','Springtime','Fist','Master','Fighter','Speed','Konoha_Whirlwind','Leaf_Whirlwind','Whirlwind','Weights','Dropped_Weights','True_Speed','Poing_Ivresse','Ivresse','loopy','loopy_fist','drunken_fist','suiken','Loopy-Fist','Drunken-Fist','Hidden-Lotus','Inner-Gate','Eight-Gate','Reverse-Lotus','Primary-Lotus','Stagger','Stumble','Sway','Unpredictable','Erratic','Chaotic','Wobbly','Spinning','Twirl','Swirl','Dance','Dancing','Leaf_Hurricane','Hurricane','Dynamic_Entry','Entry','Kick','Punch','Strike','Combo','Flurry','Barrage','Ura_Renge','Omote_Renge','Morning_Peacock','Peacock'],
    combo:['Loopy','Fist','Drunken','Drunk','Sake','Suiken','Zuiken','Hidden','Lotus','Inner','Gate','Gates','Fifth','Eight','Primary','Reverse','Front','Rear','Taijutsu','Youth','Speed','Whirlwind','Leaf','Weights','True','Stagger','Stumble','Dancing','Hurricane','Dynamic','Entry','Kick','Punch','Strike','Barrage','Flurry','Peacock','Morning'] },
  { id:'KS-152-M', num:152, r:M_ALL,
    names:['Itachi','Itachi_Uchiha','ItachiUchiha','Uchiha','Uchiha_Itachi'],
    titles:['Amaterasu','Black_Flame','Black_Flames','Flames','Mangekyo','Mangekyou','Mangekyo_Sharingan','Mangekyou_Sharingan','Sharingan','Eye','Eternal','Eternal_Mangekyo','Susanoo','Tsukuyomi','Genjutsu','Fire','Fire_Style','Katon','Fireball','Burning','Inextinguishable','Heavenly','Divine','Illusion','Crow','Crows','Raven','Hunting','Akatsuki','Rogue','Ninja','Control','Domination','Master','Izanami','Izanagi','Mirror','Massacre','Clan','Prodigy','Genius','Flammes_Noires','Flamme','amaterasu','black_flame','mangekyo','susanoo','tsukuyomi','Black-Flame','Black-Flames','Mangekyo-Sharingan','Eternal-Mangekyo','Fire-Style','Inferno','Hell','Blaze','Scorch','Char','Ember','Ash','Ignite','Combustion','Sun','Solar','Celestial','Godly','Unquenchable','Eternal_Fire','Eternal_Flame','Never_Ending','Perpetual','Undying','Everlasting','Dark_Fire','Shadow_Fire','Nightmare_Realm','Moon_Reader','Counter','Reflect','Totsuka','Yata','Blade','Shield','Sword_of_Totsuka','Yata_Mirror'],
    combo:['Amaterasu','Black','Flame','Flames','Mangekyo','Sharingan','Eternal','Susanoo','Tsukuyomi','Genjutsu','Fire','Burning','Divine','Crow','Crows','Raven','Hunting','Control','Inferno','Blaze','Scorch','Totsuka','Yata','Blade','Shield','Sword','Mirror','Dark','Shadow','Nightmare','Moon','Reader'] },
  { id:'KS-153-M', num:153, r:M_ALL,
    names:['Gaara','Gaara_of_the_Sand','Sabaku_no_Gaara','Sabaku'],
    titles:['Sand_Burial','Sand_Coffin','Sand_Funeral','Sabaku','Sabaku_Soso','Sabaku_Kyuu','Sabaku_Taiso','Desert_Coffin','Desert_Funeral','Desert','Sand_Waterfall','Sand_Tsunami','Sand_Wave','Sand_Avalanche','Imperial_Funeral','Ultimate','Quicksand','Kazekage','Absolute','Shield','Defense','Sand','Burial','Funeral','Coffin','Third_Eye','Gourd','Armor','Sand_Armor','Sand_Prison','Sand_Binding','Sand_Storm','Crushing','Graveyard','Tomb','Cercueil_Sable','Sable','Cercueil','Tombeau','sand_burial','sand_coffin','sabaku','sand_funeral','Sand-Burial','Sand-Coffin','Sand-Funeral','Sand-Tsunami','Sand-Waterfall','Sand-Prison','Imperial-Funeral','Entomb','Bury','Crush','Compress','Squeeze','Suffocate','Smother','Engulf','Swallow','Devour','Prison','Cage','Trap','Capture','Constrict','Encase','Envelop','Wrap','Cocoon','Sand_Cocoon','Desert_Prison','Desert_Tomb','Desert_Graveyard','Sand_Tomb','Sand_Grave','Sand_Cascade','Sand_Flow','Sand_Stream','Sand_River','Sand_Drizzle','Sand_Rain','Sand_Shower','Sand_Hail'],
    combo:['Sand','Burial','Coffin','Funeral','Sabaku','Soso','Kyuu','Taiso','Desert','Waterfall','Tsunami','Avalanche','Imperial','Quicksand','Kazekage','Absolute','Shield','Armor','Prison','Storm','Crushing','Tomb','Grave','Cocoon','Cascade','Flow','Wave','Engulf','Swallow','Capture','Encase'] },
];

// ═══════════════════ URL GENERATORS (5 PHASES) ═══════════════════
function nums(n) { return [...new Set([String(n), String(n).padStart(2,'0'), String(n).padStart(3,'0')])]; }

function phaseA(c) { // Priority titles — full expansion (brute7+8 merged)
  const u = new Set();
  for (const base of BASES) {
    for (const n of nums(c.num)) {
      for (const r of c.r) {
        for (const nm of c.names) {
          for (const t of c.titles) {
            for (const w of W_KEY) { u.add(`${base}${n}_${r}_${nm}_${t}${w}.webp`); u.add(`${base}${n}_${r}_${nm}-${t}${w}.webp`); }
            u.add(`${base}${n}_${r}_${nm}_${t}-1920w.jpg`); u.add(`${base}${n}_${r}_${nm}_${t}-1920w.png`);
          }
          for (const w of W_KEY) u.add(`${base}${n}_${r}_${nm}${w}.webp`);
        }
      }
    }
  }
  return [...u].filter(x => !tested.has(x));
}

function phaseB(c) { // Dictionary single-word
  const u = new Set();
  for (const n of nums(c.num)) {
    for (const r of c.r) {
      for (const nm of c.names.slice(0,3)) {
        for (const w of DICT) {
          u.add(`${B}${n}_${r}_${nm}_${w}-1920w.webp`);
          u.add(`${B}${n}_${r}_${nm}_${w.toLowerCase()}-1920w.webp`);
          u.add(`${B}${n}_${r}_${nm}${w}-1920w.webp`);
        }
        u.add(`${B}${n}_${r}_${nm}-1920w.webp`);
      }
    }
  }
  return [...u].filter(x => !tested.has(x));
}

function phaseC(c) { // Combinatorial pairs
  const u = new Set();
  const ns = nums(c.num).slice(0,2);
  for (const n of ns) {
    for (const r of c.r.slice(0,4)) {
      for (const nm of c.names.slice(0,2)) {
        for (const a of c.combo) { for (const b of c.combo) { if (a!==b) u.add(`${B}${n}_${r}_${nm}_${a}_${b}-1920w.webp`); } }
      }
    }
  }
  return [...u].filter(x => !tested.has(x));
}

function phaseD(c) { // Structural variants
  const u = new Set();
  const n0 = nums(c.num)[0];
  const topT = c.titles.slice(0,30);
  const topN = c.names.slice(0,3);
  for (const r of c.r.slice(0,5)) {
    for (const nm of topN) {
      for (const t of topT) {
        u.add(`${B}${n0}_${r}_${nm}_${t.toLowerCase()}-1920w.webp`);       // lowercase
        u.add(`${B}${n0}_${r}_${nm}${t.replace(/_/g,'')}-1920w.webp`);     // no separator
        u.add(`${B}${n0}_${r}_${t}_${nm}-1920w.webp`);                     // reversed
      }
    }
  }
  // No rarity
  for (const nm of topN) { for (const t of topT) { u.add(`${B}${n0}_${nm}_${t}-1920w.webp`); } }
  // Wildcard rarity sweep
  for (const r of WILD) {
    if (c.r.includes(r)) continue;
    for (const nm of topN.slice(0,2)) { u.add(`${B}${n0}_${r}_${nm}-1920w.webp`); for (const t of topT.slice(0,5)) u.add(`${B}${n0}_${r}_${nm}_${t}-1920w.webp`); }
  }
  return [...u].filter(x => !tested.has(x));
}

function phaseE(c) { // Full width sweep on top titles
  const u = new Set();
  const topT = c.titles.slice(0,5);
  const n0 = nums(c.num)[0];
  for (const r of c.r.slice(0,3)) {
    for (const nm of c.names.slice(0,2)) {
      for (const t of topT) {
        for (const w of W_ALL) { u.add(`${B}${n0}_${r}_${nm}_${t}${w}.webp`); u.add(`${B}${n0}_${r}_${nm}_${t}${w}.jpg`); u.add(`${B}${n0}_${r}_${nm}_${t}${w}.png`); }
      }
    }
  }
  return [...u].filter(x => !tested.has(x));
}

// ═══════════════════ DASHBOARD ═══════════════════
function log(msg) { clearLine(); console.log(msg); }
function clearLine() { process.stdout.write('\x1B[2K\r'); }
function elapsed() { const s=Math.floor((Date.now()-t0)/1000); return `${Math.floor(s/60)}m${String(s%60).padStart(2,'0')}s`; }
function totalNew() { let t=0; for (const k in S) t += S[k].tested; return t; }
function rate() { const s=(Date.now()-t0)/1000; const n=totalNew(); return s>0 ? Math.round(n/s) : 0; }

function bar(pct, len) {
  const filled = Math.round(pct/100*len);
  return '#'.repeat(filled) + '.'.repeat(len - filled);
}

let dashTimer = null;
function startDash() {
  dashTimer = setInterval(() => {
    const lines = [];
    const tn = totalNew();
    const r = rate();
    lines.push('');
    lines.push('\x1B[2J\x1B[H'); // clear screen
    lines.push(' ____  ____  _  _ _____ ___  _  ___       ___ _  _ ____ _  ___  _  _');
    lines.push('| __ \\| __ \\| || |_   _| __|| ||   \\     | __| || / __|| |/ _ \\| \\| |');
    lines.push('| __ <|    /| __ | | | | _| |_| |) |  __ | _|| __ \\__ \\| | (_) | .` |');
    lines.push('|____/|_|\\_\\|_||_| |_| |___|(_)|___/  (__|_| |_||_|___/|_|\\___/|_|\\_|');
    lines.push('');
    lines.push(`  4050 CONCURRENT  |  19 CARDS  |  5 PHASES PER CARD`);
    lines.push('');
    lines.push(`  Time: ${elapsed()}   Rate: ${r.toLocaleString()}/s   Tested: ${tn.toLocaleString()}   Found: ${found.length}`);
    lines.push(`  Skipped: ${tested.size.toLocaleString()} (loaded from brute6-9)`);
    lines.push('  ' + '─'.repeat(62));

    // Card grid (2 columns)
    const ids = CARDS.map(c => c.id);
    const mid = Math.ceil(ids.length / 2);
    const left = ids.slice(0, mid);
    const right = ids.slice(mid);

    for (let i = 0; i < left.length; i++) {
      let line = '  ' + fmtCard(left[i]);
      if (i < right.length) line += '  |  ' + fmtCard(right[i]);
      lines.push(line);
    }

    // Overall progress
    let totalUrls = 0, doneUrls = 0;
    for (const k in S) { totalUrls += S[k].total; doneUrls += S[k].tested; }
    const overallPct = totalUrls > 0 ? Math.round(doneUrls/totalUrls*100) : 0;
    lines.push('');
    lines.push(`  [${bar(overallPct, 50)}] ${overallPct}% overall`);
    lines.push('');

    process.stdout.write(lines.join('\n'));
  }, 300);
}

function fmtCard(id) {
  const s = S[id];
  if (!s) return `${shortId(id)}  [....................] waiting`;
  if (s.found) return `${shortId(id)}  [${'*'.repeat(20)}] FOUND!`;
  if (s.done)  return `${shortId(id)}  [${'#'.repeat(20)}] DONE - X`;
  const pct = s.total > 0 ? Math.round(s.tested/s.total*100) : 0;
  const ph = s.phaseName || '???';
  return `${shortId(id)}  [${bar(pct, 20)}] ${String(pct).padStart(3)}% ${ph}`;
}

function shortId(id) { return id.replace('KS-','').padEnd(7); }

function stopDash() { if (dashTimer) { clearInterval(dashTimer); dashTimer = null; } }

function showFound(cardId, fn, sz, url) {
  stopDash();
  console.log('\n');
  const star = '*'.repeat(52);
  console.log(`  ${star}`);
  console.log(`  *                                                *`);
  console.log(`  *   IMAGE FOUND!    ${cardId.padEnd(29)}*`);
  console.log(`  *                                                *`);
  console.log(`  *   File: ${fn.substring(0,38).padEnd(38)} *`);
  console.log(`  *   Size: ${(sz/1024).toFixed(1)} KB`.padEnd(51) + '*');
  console.log(`  *   Saved: newvisual/${cardId}.webp`.padEnd(51) + '*');
  console.log(`  *                                                *`);
  console.log(`  ${star}`);
  console.log('');
  // small pause then restart dash
  setTimeout(() => startDash(), 1500);
}

// ═══════════════════ WORKER ═══════════════════
async function work(card, foundSet) {
  if (foundSet.has(card.id)) { S[card.id] = { tested:0, total:0, done:true, found:false, phaseName:'SKIP' }; return; }

  const phases = [
    { name:'PhA PRI', gen: () => phaseA(card) },
    { name:'PhB DICT', gen: () => phaseB(card) },
    { name:'PhC CMB', gen: () => phaseC(card) },
    { name:'PhD VAR', gen: () => phaseD(card) },
    { name:'PhE WID', gen: () => phaseE(card) },
  ];

  let cardTested = 0;
  // Pre-calc total
  let cardTotal = 0;
  const allUrls = [];
  for (const ph of phases) {
    const urls = ph.gen();
    allUrls.push({ name: ph.name, urls });
    cardTotal += urls.length;
  }

  S[card.id] = { tested:0, total: cardTotal, done:false, found:false, phaseName:'init' };

  for (const { name, urls } of allUrls) {
    if (halt || foundSet.has(card.id)) break;
    S[card.id].phaseName = name;

    for (let i = 0; i < urls.length; i += CC) {
      if (halt || foundSet.has(card.id)) break;
      const batch = urls.slice(i, i + CC);
      const results = await Promise.all(batch.map(head));

      for (const r of results) {
        tested.add(r.url);
        S[card.id].tested++;

        if (r.s === 200 && r.z > MIN_SZ) {
          const fn = r.url.split('/').pop();
          const dest = path.join(OUT, `${card.id}.webp`);
          try {
            await dl(r.url, dest);
            const stat = fs.statSync(dest);
            found.push({ cardId: card.id, url: r.url, size: stat.size, fn });
            foundSet.add(card.id);
            S[card.id].found = true;
            S[card.id].done = true;
            showFound(card.id, fn, stat.size, r.url);
            save();
          } catch(e) { log(`  [${card.id}] Download FAILED: ${e.message}`); }
          return;
        }
      }
    }
  }

  S[card.id].done = true;
  S[card.id].phaseName = 'DONE';
}

// ═══════════════════ MAIN ═══════════════════
async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('');
  console.log(' ____  ____  _  _ _____ ___  _  ___       ___ _  _ ____ _  ___  _  _');
  console.log('| __ \\| __ \\| || |_   _| __|| ||   \\     | __| || / __|| |/ _ \\| \\| |');
  console.log('| __ <|    /| __ | | | | _| |_| |) |  __ | _|| __ \\__ \\| | (_) | .` |');
  console.log('|____/|_|\\_\\|_||_| |_| |___|(_)|___/  (__|_| |_||_|___/|_|\\___/|_|\\_|');
  console.log('');
  console.log('  Loading progress from brute6-9...');
  loadAll();

  const foundSet = new Set(found.map(f => f.cardId));
  log(`  Previously found: ${found.length} cards`);
  log('');
  log('  Estimating URLs per card...');

  for (const c of CARDS) {
    const a = phaseA(c).length, b = phaseB(c).length, cc = phaseC(c).length, d = phaseD(c).length, e = phaseE(c).length;
    const tot = a+b+cc+d+e;
    S[c.id] = { tested:0, total:tot, done: foundSet.has(c.id), found: foundSet.has(c.id), phaseName: foundSet.has(c.id) ? 'SKIP' : 'wait' };
    log(`  ${c.id}: ${tot.toLocaleString()} new (A:${a} B:${b} C:${cc} D:${d} E:${e})`);
  }

  let grand = 0;
  for (const k in S) grand += S[k].total;
  log(`\n  GRAND TOTAL: ${grand.toLocaleString()} new URLs to test`);
  log(`  Estimated time: ~${Math.max(1, Math.ceil(grand / 4050 * 0.12 / 60))} minutes`);
  log('');
  log('  Launching 19 workers...');
  log('');

  // Small delay then start dashboard
  await new Promise(r => setTimeout(r, 1000));
  startDash();

  await Promise.all(CARDS.map(c => work(c, foundSet)));

  stopDash();
  save();

  // ─── FINAL REPORT ─────────────────────────────
  const allFound = [
    { cardId:'KS-108-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/108_R_Naruto_Rasengan-1920w.webp' },
    { cardId:'KS-112-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/112_R_Choji_Chili_Pepper-1920w.webp' },
    { cardId:'KS-128-R', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/128_R_Itachi_Control-1920w.webp' },
    { cardId:'KS-145-M', url:'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/145_M_Naruto_Original_Team-1920w.webp' },
    ...found.map(f => ({ cardId: f.cardId, url: f.url }))
  ];
  const seen = new Set();
  const uniq = allFound.filter(f => { if (seen.has(f.cardId)) return false; seen.add(f.cardId); return true; });

  fs.writeFileSync(path.join(OUT, 'found_missing_urls.txt'), uniq.map(f => `${f.cardId} | ${f.url}`).join('\n') + '\n');

  const missing = CARDS.filter(c => !seen.has(c.id));
  fs.writeFileSync(path.join(OUT, 'not_found_cards.txt'),
    `Cards NOT found on CDN (brute-force across 10 scripts, ${tested.size.toLocaleString()}+ URLs tested):\n\n` +
    missing.map(c => `${c.id} — ${c.names[0]}`).join('\n') + `\n\n${missing.length} cards remaining.\n`);

  console.clear();
  const tn = totalNew();
  console.log('');
  console.log('  ' + '='.repeat(62));
  console.log('  |              BRUTE10 FUSION — FINAL REPORT              |');
  console.log('  ' + '='.repeat(62));
  console.log(`  |  Duration:        ${elapsed().padEnd(41)}|`);
  console.log(`  |  New URLs tested: ${tn.toLocaleString().padEnd(41)}|`);
  console.log(`  |  Total tested:    ${tested.size.toLocaleString().padEnd(41)}|`);
  console.log(`  |  Rate:            ${rate().toLocaleString().padEnd(38)}/s |`);
  console.log(`  |  New found:       ${found.length.toString().padEnd(41)}|`);
  console.log('  ' + '-'.repeat(62));

  if (found.length > 0) {
    console.log('  |  FOUND:                                                  |');
    for (const f of found) console.log(`  |    ${f.cardId} -> ${(f.fn||'').substring(0,45).padEnd(45)}|`);
  } else {
    console.log('  |  No new images found.                                    |');
  }

  console.log('  ' + '-'.repeat(62));
  console.log(`  |  STILL MISSING (${missing.length}):`.padEnd(63) + '|');
  for (const c of missing) console.log(`  |    ${c.id} — ${c.names[0]}`.padEnd(63) + '|');
  console.log('  ' + '='.repeat(62));
  console.log('');

  fs.writeFileSync(path.join(OUT, 'brute10_report.txt'),
    `BRUTE10-FUSION REPORT\nDuration: ${elapsed()}\nNew: ${tn.toLocaleString()}\nTotal: ${tested.size.toLocaleString()}\nRate: ${rate()}/s\nFound: ${found.length}\n\n` +
    (found.length ? 'FOUND:\n' + found.map(f => `  ${f.cardId} -> ${f.url}`).join('\n') + '\n' : '') +
    '\nMISSING:\n' + missing.map(c => `  ${c.id}`).join('\n') + '\n');

  console.log('  Reports: brute10_report.txt, found_missing_urls.txt, not_found_cards.txt');
}

process.on('SIGINT', () => { stopDash(); console.log('\n\n  Saving progress...'); halt=true; save(); setTimeout(()=>process.exit(0),1500); });
main().catch(e => { stopDash(); console.error(e); save(); process.exit(1); });
