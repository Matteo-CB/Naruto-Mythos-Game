/**
 * brute8-max.js — 19 workers, 450 concurrent requests, maximum URL coverage
 * Skips all previously tested URLs from brute6+brute7.
 * Each card ID gets its own dedicated worker.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONCURRENCY = 450;
const DELAY_MS = 2;
const TIMEOUT_MS = 5000;
const MIN_SIZE = 5000;
const BASE = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/opt/';
const BASE2 = 'https://lirp.cdn-website.com/99e556bf/dms3rep/multi/';
const agent = new https.Agent({ keepAlive: true, maxSockets: 500, maxFreeSockets: 100 });
const OUT = path.join(__dirname, '..', 'newvisual');
const PROG = path.join(OUT, 'brute8_progress.json');

// ─── Load all previously tested URLs ────────────────────────────
let testedSet = new Set();
let found = [];
let interrupted = false;

function loadTested() {
  for (const f of ['brute6_progress.json', 'brute7_progress.json', 'brute8_progress.json']) {
    try {
      const p = path.join(OUT, f);
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        (d.tested || []).forEach(u => testedSet.add(u));
        if (d.found) found.push(...d.found);
      }
    } catch(e) {}
  }
  console.log(`  Loaded ${testedSet.size} previously tested URLs`);
}

function saveProgress() {
  const newOnly = [...testedSet].slice(-100000);
  fs.writeFileSync(PROG, JSON.stringify({ tested: newOnly, found, saved: new Date().toISOString() }));
}

// ─── HTTP ───────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function head(url) {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, path: u.pathname, method: 'HEAD',
        timeout: TIMEOUT_MS, agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'image/*', Referer: 'https://www.narutotcgmythos.com/' }
      }, res => { res.resume(); resolve({ url, s: res.statusCode, sz: parseInt(res.headers['content-length']||'0',10) }); });
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

// ─── 19 cards, each as separate worker ──────────────────────────
const W = ['-1920w','-1280w','-960w','-640w','-480w','-1600w','-2048w','-2560w','-3840w','-384w','-256w','-128w',''];
const EXT = ['.webp','.jpg','.png'];

// ALL possible rarity prefix formats
const ALL_R = ['R','R_ART','RA','ART','Rare','Rare_Art','R-ART','R_Art'];
const ALL_RA = ['R_ART','RA','ART','Rare_Art','R-ART','R_Art','R_ART_GOLD','R_art'];
const ALL_S = ['Secret_GOLD','SecretV_GOLD','S','Secret','SecretV','Secret_Gold','Secret_SILVER','Secret_gold','S_GOLD','Gold'];
const ALL_M = ['M','M_Special','MV','MV_Special','Mythos','M_special','Mythos_Special','M_SPECIAL'];
const ALL_UC = ['UC','Uncommon','U'];

function gen(cardId, num, rPrefixes, names, titles) {
  const urls = new Set();
  const nums = [String(num), String(num).padStart(2,'0'), String(num).padStart(3,'0')];

  const add = (b, n, r, name, title, w, e) => {
    if (title) {
      urls.add(`${b}${n}_${r}_${name}_${title}${w}${e}`);
      urls.add(`${b}${n}_${r}_${name}-${title}${w}${e}`); // Kabuto-style
    } else {
      urls.add(`${b}${n}_${r}_${name}${w}${e}`);
    }
  };

  for (const b of [BASE, BASE2]) {
    for (const n of nums) {
      for (const r of rPrefixes) {
        for (const name of names) {
          // All titles + no title
          for (const t of [...titles, null]) {
            for (const w of W) {
              add(b, n, r, name, t, w, '.webp');
            }
            for (const w of ['-1920w','-960w','']) {
              add(b, n, r, name, t, w, '.jpg');
              add(b, n, r, name, t, w, '.png');
            }
          }
        }
      }
      // No rarity prefix at all: {num}_{name}_{title}
      for (const name of names.slice(0,3)) {
        for (const t of titles.slice(0,20)) {
          urls.add(`${BASE}${n}_${name}_${t}-1920w.webp`);
          urls.add(`${BASE}${n}_${name}-1920w.webp`);
        }
      }
    }
  }
  return [...urls].filter(u => !testedSet.has(u));
}

// ─── Card definitions: 19 separate entries ──────────────────────
const CARDS = [
  { id:'KS-045-UC', num:45, r:ALL_UC,
    names:['Anko','Anko_Mitarashi','AnkoMitarashi','Mitarashi','Mitarashi_Anko'],
    titles:['Shadow_Snake','Snake_Hands','Shadow_Snake_Hands','Striking_Shadow','Striking_Shadow_Snakes','Striking_Snakes','Hidden_Shadow','Hidden_Shadow_Snake','Sen_Ei','Sen_Ei_Jashu','Senei_Jashu','Senei','Jashu','Shadow_Snake_Hand','Snake_Hand','Many_Hidden_Shadow_Snake_Hands','Proctor','Examiner','Special_Jonin','Jonin','Forest_Death','Forest_of_Death','Death_Forest','Second_Exam','Exam','Chunin_Exam','Snake','Snakes','Serpent','Serpents','Viper','Snake_Strike','Snake_Fang','Snake_Attack','Snake_Assault','Snake_Authority','Twin_Snakes','Venomous','Poison','Venom','Toxic','Cursed','Cursed_Seal','Cursed_Mark','Curse','Mark','Heaven_Seal','Assassin','Ambush','Dangerous','Fierce','Deadly','Dango','Sweet_Bean','Poigne','Serpent_Spectral','Ombre','Shadow-Snake','Snake-Hands','Shadow-Snake-Hands','Sen-Ei-Jashu','Striking-Shadow-Snakes','shadow_snake','snake_hands','shadow_snake_hands','striking_shadow','hidden_shadow','Multiple_Snakes','Dual_Snake','Branded','Kunoichi','Mitarashi_Special','Snake_Bite','Bite','Fang','Fangs','Coil','Constrict','Wrap','Strangle','Hidden','Secret','Deadly_Snake','Twin_Snake','Double_Snake','Serpent_Strike','Snake_Fist','Shadow_Serpent','Spectral','Ghost_Snake','Phantom','Spirit_Snake'] },

  { id:'KS-115-R', num:115, r:ALL_R,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame','Aburame_Shino'],
    titles:['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Wall_Technique','Bug_Wall_Technique','Insect_Dome','Bug_Dome','Insect_Sphere','Bug_Sphere','Insect_Clone','Bug_Clone','Insect_Jar','Bug_Jar','Parasitic_Wall','Parasitic_Destruction','Hidden_Insect','Insect_Jamming','Bug_Jamming','Destruction_Host','Host_Technique','Destruction_Bug','Mushi','Kikaichuu','Kikaichu','Kikai','Swarm','Insect','Insects','Wall','Bug','Bugs','Colony','Hive','Beetle','Beetles','Bug_Shield','Bug_Barrier','Living_Wall','Insect_Armor','Bug_Swarm','Infestation','Shield','Barrier','Defense','Protection','Aburame','Aburame_Technique','Insect_Pillar','Sunglasses','Silent','Quiet','Stoic','Mur_Insectes','Technique_Mur','Insecte','insect_wall','bug_wall','insect_dome','parasitic','Insect-Wall','Bug-Wall','Bug-Dome','Parasitic_Insects','Bug_Host','Destruction_Colony','Secret_Technique','Insect_Shield','Bug_Armor','Insect_Swarm','Bug_Pillar','Insect_Cocoon','Cocoon','Chrysalis','Larva','Nest','Insect_Nest','Bug_Nest','Insect_Wave','Bug_Wave','Creeping','Crawling'] },

  { id:'KS-115-RA', num:115, r:ALL_RA,
    names:['Shino','Shino_Aburame','ShinoAburame','Aburame'],
    titles:['Insect_Wall','Bug_Wall','Wall_of_Insects','Insect_Wall_Technique','Bug_Wall_Technique','Insect_Dome','Bug_Dome','Insect_Sphere','Bug_Sphere','Insect_Clone','Bug_Clone','Parasitic_Wall','Parasitic_Destruction','Hidden_Insect','Insect_Jamming','Destruction_Host','Destruction_Bug','Kikaichuu','Kikaichu','Swarm','Insect','Insects','Wall','Bug','Bugs','Colony','Hive','Beetle','Bug_Shield','Bug_Barrier','Insect_Armor','Bug_Swarm','Shield','Barrier','Aburame','Insect_Pillar','insect_wall','bug_wall','Insect-Wall','Bug-Wall','Parasitic_Insects','Secret_Technique','Insect_Shield','Bug_Armor','Insect_Nest','Cocoon','Insect_Wave'] },

  { id:'KS-116-RA', num:116, r:ALL_RA,
    names:['Neji','Neji_Hyuga','NejiHyuga','Hyuga','Hyuga_Neji'],
    titles:['Eight_Trigrams','Sixty-Four_Palms','Sixty_Four_Palms','Eight_Trigrams_64','Eight_Trigrams_Sixty-Four','Hakke_64','Hakke_Rokujuyon','Hakke','Rokujuyon','64_Palms','64_palms','64_Palms_Strike','Gentle_Step','Gentle_fist','Gentle_Fist','Palm_Rotation','Rotation','Byakugan','Air_Palm','Vacuum_Palm','Divination','Guardian','Prodigy','Hyuga_Prodigy','Destiny','Fate','Cage','Caged_Bird','Branch_House','Genius','Gifted','Trigrams','Palms','Strike','Soixante-Quatre','eight_trigrams','sixty_four_palms','gentle_fist','Eight-Trigrams','Sixty-Four-Palms','Sixty-Four','Eight-Trigrams-64','Sixty_Four','Palms_Strike','All_Seeing','White_Eye','360','Full_View','Heavenly_Spin','Kaiten','Palm_Bottom','Tenketsu','Chakra_Points','Juken','Juuken'] },

  { id:'KS-122-R', num:122, r:ALL_R,
    names:['Jirobo','Jiroubou','Jirobou','Jirôbô','Jiroubô'],
    titles:['Arhat','Arhat_Fist','arhat_fist','Earth_Dome','Earth_Prison','Earth_Barrier','Absorbing_Barrier','Chakra_Drain','Absorbing','Absorption','Earth_Sphere','Sphere','Barrier','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Stage_Two','Stage_2','Transformation','Full_Power','Sound_Four','Sound_Ninja','Bearer','Ogre','Golem','Rock','Boulder','Giant','Fist','Power','Punch','Slam','Strength','Body_Slam','Brute','Brute_Force','Rage','Poing','Dôme_Terre','arhat','cursed_seal','earth_dome','fist','Arhat-Fist','Cursed-Seal','Earth-Prison','Earth-Dome','Level-Two','Sound-Four','Awakened','Powered_Up','Dark_Power','Seal_Release','Monster','Hulk','Titan','Colossus','Smash','Ground_Pound','Earth_Fist','Stone_Fist','Stone','Earth','Chakra_Absorb','Drain','Siphon','Devour','Consume','Glutton','Hungry','Feast'] },

  { id:'KS-122-RA', num:122, r:ALL_RA,
    names:['Jirobo','Jiroubou','Jirobou'],
    titles:['Arhat','Arhat_Fist','arhat_fist','Earth_Dome','Earth_Prison','Earth_Barrier','Absorbing_Barrier','Chakra_Drain','Absorbing','Absorption','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Full_Power','Sound_Four','Ogre','Golem','Boulder','Giant','Fist','Power','Punch','Slam','Brute','Rage','arhat','cursed_seal','earth_dome','Arhat-Fist','Cursed-Seal','Earth-Prison','Monster','Titan','Earth_Fist','Stone_Fist','Stone','Earth','Chakra_Absorb','Drain','Glutton','Feast'] },

  { id:'KS-124-R', num:124, r:ALL_R,
    names:['Kidomaru','Kidoumaru','Kidômaru'],
    titles:['Spider_Bow','Fierce_Rip','Spider_Bow_Fierce','Spider_Sticky','Spider_Sticky_Gold','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Kumoshibari','Kumo','Spider_Thread','Spider_Net','Spider_Web','Web','Spider','Thread','Cursed_Seal','Level_Two','Level_2','Second_State','Stage_Two','Sound_Four','Sound_Ninja','Bearer','Archer','Hunter','Predator','Third_Eye','Six_Arms','Arms','Sticky','Golden','Gold','Armor','Cocoon','Arc_Araignee','Araignee','spider_bow','fierce_rip','gold_arrow','spider_web','Spider-Bow','Fierce-Rip','Gold-Arrow','War-Bow','Spider-Web','Spider-Thread','Marksman','Sniper','Projectile','Shot','Shoot','Target','Aim','Precision','Long_Range','Ranged','Sticky_Gold','Web_Armor','Spider_Armor','Arachnid','Eight_Legs','Multi_Arm','Six_Arm','Kawarimi','Strategy','Tactical'] },

  { id:'KS-124-RA', num:124, r:ALL_RA,
    names:['Kidomaru','Kidoumaru'],
    titles:['Spider_Bow','Fierce_Rip','Spider_Bow_Fierce','Spider_Sticky','Gold_Arrow','Golden_Arrow','War_Bow','Bow','Arrow','Kumoshibari','Spider_Thread','Spider_Net','Spider_Web','Web','Spider','Cursed_Seal','Level_Two','Second_State','Sound_Four','Archer','Hunter','Third_Eye','Six_Arms','Sticky','Golden','Gold','Cocoon','spider_bow','fierce_rip','gold_arrow','Spider-Bow','Fierce-Rip','Gold-Arrow','Marksman','Sniper','Projectile','Arachnid','Spider_Armor','Ranged'] },

  { id:'KS-126-R', num:126, r:ALL_R,
    names:['Orochimaru'],
    titles:['Summoning','Summoning_Jutsu','Snake_Summoning','Manda','Manda_Summoning','Giant_Snake','Triple_Rashomon','Rashomon','Formation','Kusanagi','Grass_Cutter','Sword','Blade','Grass_Long_Sword','Five_Pronged_Seal','Five_Pronged','Living_Corpse','Body_Transfer','Transference','Edo_Tensei','Reanimation','Snake','Snake_Lord','Snake_Master','Sannin','Fear','Intimidation','Fury','Wrath','Threat','Confrontation','Attack','Assault','Power','Immortal','Forbidden','True_Form','True_Power','Villain','Invasion','Forest','Eight_Headed','Yamata','White_Snake','Get_Out','Out_of_Way','Sound','Otokage','Lord','Unstoppable','Path','Way','Rage','Obstacle','Move','Force','Domination','Overwhelming','Chemin','Otez','Invocation','summoning','manda','kusanagi','snake','Snake-Summoning','Giant-Snake','Five-Pronged-Seal','Get-Out','Living-Corpse','Body-Transfer','White-Snake','True-Form','Triple-Rashomon','Tongue','Shed','Rebirth','Immortality','Experiment','Lab','Science','Jutsu','Ninjutsu','Kinjutsu','Sacrifice','Soul','Curse','Heaven','Seal','Branded','Terror','Horror','Nightmare','Shadow','Darkness','Evil','Ambition','Power_Hungry','Desire','Greed','Knowledge','Forbidden_Jutsu','Kuchiyose','Impure','World','Dead','Undead'] },

  { id:'KS-127-R', num:127, r:ALL_R,
    names:['Sakon','Sakon_Ukon','SakonUkon','Ukon','Ukon_Sakon'],
    titles:['Stone_Fist','Stone_fist','stone_fist','Tarenken','Multiple_Fist','Multiple_Connected_Fist','Parasite','Demon_Parasite','Parasitic','Molecular_Possession','Possession','Black_Seal','Seal','Cursed_Seal','Cursed_Seal_Level_2','Curse_Mark','Level_Two','Level_2','Second_State','Stage_Two','Merge','Combined','Combination','Fusion','Ukon_Merge','Ukon','Twin','Twins','Brothers','Sound_Four','Sound_Ninja','Bearer','Combined_Attack','Punch','Fist','Power','Demon','Ogre','Monster','Rashomon','Poing_Pierre','Pierre','stone_fist','cursed_seal','merge','tarenken','Stone-Fist','Cursed-Seal','Combined-Attack','Multiple-Fist','Demon-Parasite','Attach','Leech','Absorb','Infect','Host','Body','Inside','Inhabit','Infiltrate','Split','Separate','Together','Duo','Pair','Double','Merged','United','Conjoined','Connected','Linked'] },

  { id:'KS-127-RA', num:127, r:ALL_RA,
    names:['Sakon','Sakon_Ukon','Ukon'],
    titles:['Stone_Fist','Stone_fist','Tarenken','Multiple_Fist','Parasite','Demon_Parasite','Parasitic','Molecular_Possession','Possession','Black_Seal','Cursed_Seal','Level_Two','Second_State','Merge','Combined','Fusion','Ukon','Twin','Sound_Four','Punch','Fist','Demon','Monster','stone_fist','cursed_seal','Stone-Fist','Cursed-Seal','Attach','Leech','Host','Body','Split','Together','Duo','Pair','Merged','Connected'] },

  { id:'KS-129-R', num:129, r:[...ALL_R,...ALL_M],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Naruto','Naruto_Kyubi','Naruto_Fox','Naruto_Uzumaki','Kurama','Fox','Demon_Fox'],
    titles:['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Red_Aura','Tailed_Cloak','Chakra_Cloak','Bijuu_Cloak','Jinchuuriki','Jinchuriki','Partial_Trasformation','Partial_Transformation','Version_1','V1','Initial','Awakening','One_Tail_Cloak','Fox','Demon','Red','Rage','Rampage','Beast','Beast_Cloak','Demon_Mantle','Fury','Berserk','Feral','Wild','Power','Unleashed','Released','Uncontrolled','Chakra','Red_Chakra_Cloak','Crimson','Seal','Broken_Seal','Seal_Break','Nine-Tails_Cloak','Tailed_Beast','Renard','Manteau','Demon_Renard','demon_fox','fox_cloak','red_chakra','jinchuriki','Demon-Fox','Fox-Cloak','Red-Chakra','Nine-Tails-Cloak','Bijuu-Cloak','Beast-Cloak','Tail','One_Tail','Two_Tails','Cloak_V1','Initial_Form','Shroud','Red_Shroud','Chakra_Shroud','Aura','Malice','Hatred','Dark_Chakra','Frenzy','Berserker','Possessed','Controlled','Overflow','Leak','Seal_Weakening'] },

  { id:'KS-129-RA', num:129, r:[...ALL_RA,...ALL_M],
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','Naruto','Naruto_Kyubi','Kurama','Fox','Demon_Fox'],
    titles:['Demon_Fox','Demon_Fox_Cloak','Fox_Cloak','Cloak','Fox_Mode','Red_Chakra','Red_Aura','Bijuu_Cloak','Jinchuuriki','Jinchuriki','Partial_Trasformation','Partial_Transformation','Version_1','V1','Fox','Demon','Red','Rage','Beast','Beast_Cloak','Fury','Berserk','Unleashed','Chakra','Crimson','Seal','Tailed_Beast','demon_fox','fox_cloak','Demon-Fox','Fox-Cloak','Red-Chakra','Shroud','Red_Shroud','Aura','Frenzy','Possessed','Overflow'] },

  { id:'KS-130-R', num:130, r:[...ALL_R,...ALL_M],
    names:['One-Tail','One_Tail','OneTail','Ichibi','Gaara','Gaara_Shukaku','Shukaku','Gaara_One-Tail','Gaara_Ichibi'],
    titles:['Full_Trasformation','Complete_Trasformation','Full_Transformation','Complete_Transformation','Trasformation','Transformation','Sand_Monster','Full_Beast','Sand_Demon','Tanuki','Transform','Beast','Monster','Sand_Spirit','Guardian_Spirit','Spirit','Shukaku','Full_Shukaku','Awakened','Possesion','Possession','Possessed','Die','Ready_to_Die','Death','Kill','Full','Demon','Jinchuuriki','Jinchuriki','Sand','Sand_Form','Sand_Beast','Sand_Tanuki','Rampage','Berserk','Unleashed','Released','Giant','Colossal','Kaiju','Transformation_Complete','Monstre_Sable','full_trasformation','full_transformation','sand_monster','Full-Trasformation','Full-Transformation','Sand-Monster','Sand-Beast','Sand-Demon','Full-Beast','One-Tail_Full','One-Tail_Complete','Partial_Trasformation','Complete','Total','Ultimate','Final_Form','Berserker','Rage','Fury','Madness','Insanity','Wild','Uncontrolled','Sand_Golem','Golem','Sand_Giant','Raccoon','Raccoon_Dog','Bijuu','Tailed_Beast'] },

  { id:'KS-134-S', num:134, r:ALL_S,
    names:['Kyubi','Kyuubi','Nine-Tails','Nine_Tails','NineTails','Nine-Tailed_Fox','Nine_Tailed_Fox','NineTailed','Fox','Naruto','Kurama','Demon_Fox','Bijuu','Naruto_Kyubi','Naruto_Fox','Naruto_Uzumaki'],
    titles:['Beast_Awakens','Awakens','Awakening','Destruction','Giant_Fox','Full_Power','Unleashed','Bijuu','Demon_Fox','Tailed_Beast','Berserk','Rampage','Roar','Rage','Beast_Bomb','Bijuu_Bomb','Bijuudama','Full_Beast','Beast','Fox','Giant','Power','Awakened','Released','Unbound','Free','Nine_Tails','Tails','Demon','Monster','Kaiju','Colossal','Massive','Overwhelming','Seal_Break','Broken_Seal','Seal_Released','Rasengan','Fury','Wrath','Eveil','Destruction_Bete','Renard','beast_awakens','destruction','awakening','giant_fox','Beast-Awakens','Full-Power','Demon-Fox','Giant-Fox','Tailed-Beast','Bijuu-Bomb','Catastrophe','Apocalypse','Armageddon','Devastation','Annihilation','Havoc','Chaos','Ruin','Inferno','Hellfire','Cataclysm','Explosion','Blast','Shockwave','Tremor','Earthquake'] },

  { id:'KS-149-M', num:149, r:ALL_M,
    names:['Kiba','Kiba_Inuzuka','KibaInuzuka','Inuzuka','Inuzuka_Kiba','Kiba_Akamaru'],
    titles:['Fang','Fang_Over_Fang','Fang_over_Fang','Double_Fang','Gatsuuga','Gatsuga','Tsuga','Two-Headed','Two-Headed_Wolf','Two_Headed_Wolf','Man_Beast','Man_Beast_Clone','Beast_Clone','Wild','Wild_Fang','Piercing','Dynamic','Double','Wolf','Wolves','Pack','Akamaru','Duo','Combo','Partner','All_Four','All_Fours','All_Four_Legs','Tunneling','Tunneling_Fang','Passing_Fang','Beast','Canine','Dog','Hound','Rotation','Spinning','Drill','Claw','Crocs','Crocs_sur_Crocs','Loup','fang','fang_over_fang','gatsuuga','double_fang','Fang-Over-Fang','Two-Headed-Wolf','Man-Beast','Man-Beast-Clone','Wild-Fang','Tunneling-Fang','Twin_Fang','Dual_Fang','Inuzuka','Inuzuka_Style','Beast_Mimicry','Imitation','Clone','Transformation','Dynamic_Marking','Marking','Tracking','Nose','Scent','Smell','Hunt','Hunter','Tracker','Pursuit','Chase','Sprint','Speed','Charge','Rush','Impact','Collision','Ram','Slam'] },

  { id:'KS-151-M', num:151, r:ALL_M,
    names:['RockLee','Rock_Lee','Lee','Rock','RockLee_'],
    titles:['Loopy','Loopy_Fist','Loopy_fist','Drunken','Drunken_Fist','Drunken_fist','Suiken','Sake','Drunk','Intoxicated','Tipsy','Zui','Zui_Ken','Zuiken','Hidden_Lotus','Inner_Gate','Fifth_Gate','Eight_Gate','Gate','Lotus','Gates','Primary_Lotus','Reverse_Lotus','Front_Lotus','Rear_Lotus','Training','Taijutsu','Youth','Springtime','Fist','Master','Fighter','Speed','Konoha_Whirlwind','Leaf_Whirlwind','Whirlwind','Weights','Dropped_Weights','True_Speed','Poing_Ivresse','Ivresse','loopy','loopy_fist','drunken_fist','suiken','Loopy-Fist','Drunken-Fist','Hidden-Lotus','Inner-Gate','Eight-Gate','Reverse-Lotus','Primary-Lotus','Stagger','Stumble','Sway','Unpredictable','Erratic','Chaotic','Wobbly','Spinning','Twirl','Swirl','Dance','Dancing','Leaf_Hurricane','Hurricane','Dynamic_Entry','Entry','Kick','Punch','Strike','Combo','Flurry','Barrage','Ura_Renge','Omote_Renge','Morning_Peacock','Peacock'] },

  { id:'KS-152-M', num:152, r:ALL_M,
    names:['Itachi','Itachi_Uchiha','ItachiUchiha','Uchiha','Uchiha_Itachi'],
    titles:['Amaterasu','Black_Flame','Black_Flames','Flames','Mangekyo','Mangekyou','Mangekyo_Sharingan','Mangekyou_Sharingan','Sharingan','Eye','Eternal','Eternal_Mangekyo','Susanoo','Tsukuyomi','Genjutsu','Fire','Fire_Style','Katon','Fireball','Burning','Inextinguishable','Heavenly','Divine','Illusion','Crow','Crows','Raven','Hunting','Akatsuki','Rogue','Ninja','Control','Domination','Master','Izanami','Izanagi','Mirror','Massacre','Clan','Prodigy','Genius','Flammes_Noires','Flamme','amaterasu','black_flame','mangekyo','susanoo','tsukuyomi','Black-Flame','Black-Flames','Mangekyo-Sharingan','Eternal-Mangekyo','Fire-Style','Inferno','Hell','Blaze','Scorch','Char','Ember','Ash','Ignite','Combustion','Sun','Solar','Celestial','Godly','Unquenchable','Eternal_Fire','Eternal_Flame','Never_Ending','Perpetual','Undying','Everlasting','Dark_Fire','Shadow_Fire','Nightmare_Realm','Moon_Reader','Counter','Reflect','Totsuka','Yata','Blade','Shield','Sword_of_Totsuka','Yata_Mirror'] },

  { id:'KS-153-M', num:153, r:ALL_M,
    names:['Gaara','Gaara_of_the_Sand','Sabaku_no_Gaara','Sabaku'],
    titles:['Sand_Burial','Sand_Coffin','Sand_Funeral','Sabaku','Sabaku_Soso','Sabaku_Kyuu','Sabaku_Taiso','Desert_Coffin','Desert_Funeral','Desert','Sand_Waterfall','Sand_Tsunami','Sand_Wave','Sand_Avalanche','Imperial_Funeral','Ultimate','Quicksand','Kazekage','Absolute','Shield','Defense','Sand','Burial','Funeral','Coffin','Third_Eye','Gourd','Armor','Sand_Armor','Sand_Prison','Sand_Binding','Sand_Storm','Crushing','Graveyard','Tomb','Cercueil_Sable','Sable','Cercueil','Tombeau','sand_burial','sand_coffin','sabaku','sand_funeral','Sand-Burial','Sand-Coffin','Sand-Funeral','Sand-Tsunami','Sand-Waterfall','Sand-Prison','Imperial-Funeral','Entomb','Bury','Crush','Compress','Squeeze','Suffocate','Smother','Engulf','Swallow','Devour','Prison','Cage','Trap','Capture','Constrict','Encase','Envelop','Wrap','Cocoon','Sand_Cocoon','Desert_Prison','Desert_Tomb','Desert_Graveyard','Sand_Tomb','Sand_Grave','Sand_Cascade','Sand_Flow','Sand_Stream','Sand_River','Sand_Drizzle','Sand_Rain','Sand_Shower','Sand_Hail'] },
];

// ─── Worker ─────────────────────────────────────────────────────
async function work(card, foundSet, stats) {
  if (foundSet.has(card.id)) { console.log(`  [SKIP] ${card.id}`); return; }
  const cands = gen(card.id, card.num, card.r, card.names, card.titles);
  if (!cands.length) { console.log(`  [SKIP] ${card.id} — 0 new`); return; }
  console.log(`  [GO] ${card.id}: ${cands.length} URLs`);

  for (let i = 0; i < cands.length; i += CONCURRENCY) {
    if (interrupted || foundSet.has(card.id)) return;
    const batch = cands.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(head));
    for (const r of results) {
      testedSet.add(r.url);
      stats.t++;
      if (r.s === 200 && r.sz > MIN_SIZE) {
        const fn = r.url.split('/').pop();
        console.log(`\n  >>> FOUND ${card.id}: ${fn} (${(r.sz/1024).toFixed(1)} KB)`);
        console.log(`      ${r.url}\n`);
        const ext = path.extname(fn) || '.webp';
        const dest = path.join(OUT, `${card.id}${ext}`);
        try {
          await download(r.url, dest);
          const s = fs.statSync(dest);
          console.log(`      Saved: ${card.id} (${(s.size/1024).toFixed(1)} KB)`);
          found.push({ cardId: card.id, url: r.url, size: s.size, fn });
          foundSet.add(card.id);
          stats.f++;
        } catch(e) { console.log(`      DL fail: ${e.message}`); }
        saveProgress();
        return;
      }
    }
    if (i > 0 && (i/CONCURRENCY)%20===0) process.stdout.write(`    ${card.id}: ${i}/${cands.length} (total: ${stats.t})\r`);
    await sleep(DELAY_MS);
  }
  console.log(`  [DONE] ${card.id} — not found (${cands.length} new)`);
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('\n================================================');
  console.log('  BRUTE8-MAX: 19 workers x 450 concurrent');
  console.log('================================================');
  loadTested();
  const foundSet = new Set(found.map(f => f.cardId));
  const stats = { t: testedSet.size, f: found.length };

  // All 19 in parallel
  await Promise.all(CARDS.map(c => work(c, foundSet, stats)));
  saveProgress();

  // Report + update files
  const allFound = [
    { cardId:'KS-108-R', url:'108_R_Naruto_Rasengan' },
    { cardId:'KS-112-R', url:'112_R_Choji_Chili_Pepper' },
    { cardId:'KS-128-R', url:'128_R_Itachi_Control' },
    { cardId:'KS-145-M', url:'145_M_Naruto_Original_Team' },
    ...found.map(f=>({cardId:f.cardId, url:f.url}))
  ];
  const seen = new Set();
  const uniq = allFound.filter(f => { if(seen.has(f.cardId)) return false; seen.add(f.cardId); return true; });

  fs.writeFileSync(path.join(OUT,'found_missing_urls.txt'), uniq.map(f => `${f.cardId} | ${f.url}`).join('\n')+'\n');

  const missing = CARDS.filter(c => !seen.has(c.id));
  fs.writeFileSync(path.join(OUT,'not_found_cards.txt'),
    `Cards NOT found on CDN (brute-force across 8 scripts, ${testedSet.size}+ URLs tested):\n\n` +
    missing.map(c => `${c.id} — ${c.names[0]}`).join('\n') +
    `\n\n${missing.length} cards remaining.\n`);

  const report = `BRUTE8 REPORT\nTested: ${testedSet.size}\nFound: ${stats.f}\n\n` +
    (found.length ? 'FOUND:\n'+found.map(f=>`  ${f.cardId} -> ${f.url}`).join('\n') : 'No new images found.') +
    '\n\nSTILL MISSING:\n' + missing.map(c=>`  ${c.id}`).join('\n') + '\n';

  fs.writeFileSync(path.join(OUT,'brute8_report.txt'), report);
  console.log('\n'+report);
}

process.on('SIGINT', () => { console.log('\nSaving...'); interrupted=true; saveProgress(); setTimeout(()=>process.exit(0),1000); });
main().catch(e => { console.error(e); saveProgress(); process.exit(1); });
