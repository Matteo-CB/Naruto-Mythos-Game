import type { QuestLevel } from './questData';

export const SAISON_ARCHIVEE = 'KS';
export const SAISON_COURANTE = 'SS';

// Les quetes de la saison Shinobi Shiren sont annoncees mais pas encore suivies: elles n ont
// donc pas de hook. Le jour ou elles seront branchees, chacune recevra le sien et rejoindra
// QUESTS, sans que cette liste change de forme.
export interface QueteAnnoncee {
  id: string;
  level: QuestLevel;
  target: number;
  text_fr: string;
  text_en: string;
  text_es: string;
  text_pt: string;
  text_it: string;
  text_pl: string;
  text_ja: string;
}

export const QUETES_SHINOBI_SHIREN: QueteAnnoncee[] = [
  {
    id: 'ss-attach-play-10', level: 1, target: 10,
    text_fr: "équiper 10 personnages avec un équipement",
    text_en: 'attach 10 pieces of equipment to characters',
    text_es: 'equipa 10 objetos a tus personajes',
    text_pt: 'equipe 10 objetos aos seus personagens',
    text_it: 'equipaggia 10 oggetti sui tuoi personaggi',
    text_pl: 'załóż 10 przedmiotów swoim postaciom',
    text_ja: 'キャラクターに装備を10回つける',
  },
  {
    id: 'ss-first-strike-5', level: 1, target: 5,
    text_fr: "déclencher 5 effets FIRST STRIKE",
    text_en: 'trigger 5 FIRST STRIKE effects',
    text_es: 'activa 5 efectos FIRST STRIKE',
    text_pt: 'ative 5 efeitos FIRST STRIKE',
    text_it: 'attiva 5 effetti FIRST STRIKE',
    text_pl: 'uruchom 5 efektów FIRST STRIKE',
    text_ja: 'FIRST STRIKE効果を5回発動する',
  },
  {
    id: 'ss-duel-5', level: 1, target: 5,
    text_fr: "remplir la condition de 5 effets DUEL",
    text_en: 'meet the condition of 5 DUEL effects',
    text_es: 'cumple la condición de 5 efectos DUEL',
    text_pt: 'cumpra a condição de 5 efeitos DUEL',
    text_it: 'soddisfa la condizione di 5 effetti DUEL',
    text_pl: 'spełnij warunek 5 efektów DUEL',
    text_ja: 'DUEL効果の条件を5回満たす',
  },
  {
    id: 'ss-play-sound-four-20', level: 1, target: 20,
    text_fr: "jouer 20 personnages du Quatre du Son",
    text_en: 'play 20 Sound Four characters',
    text_es: 'juega 20 personajes del Cuarteto del Sonido',
    text_pt: 'jogue 20 personagens do Quarteto do Som',
    text_it: 'gioca 20 personaggi del Quartetto del Suono',
    text_pl: 'zagraj 20 postaci Czwórki Dźwięku',
    text_ja: '音の四人衆のキャラクターを20体出す',
  },
  {
    id: 'ss-mission-attach-5', level: 1, target: 5,
    text_fr: "poser 5 équipements sur une mission",
    text_en: 'attach 5 pieces of equipment to a mission',
    text_es: 'coloca 5 equipos en una misión',
    text_pt: 'coloque 5 equipamentos numa missão',
    text_it: 'metti 5 equipaggiamenti su una missione',
    text_pl: 'umieść 5 przedmiotów na misji',
    text_ja: 'ミッションに装備を5回つける',
  },
  {
    id: 'ss-win-with-set2-3', level: 1, target: 3,
    text_fr: "gagner 3 parties avec un deck contenant du Shinobi Shiren",
    text_en: 'win 3 games with a deck containing Shinobi Shiren cards',
    text_es: 'gana 3 partidas con un mazo que incluya cartas de Shinobi Shiren',
    text_pt: 'vença 3 partidas com um deck contendo cartas de Shinobi Shiren',
    text_it: 'vinci 3 partite con un mazzo che contiene carte di Shinobi Shiren',
    text_pl: 'wygraj 3 gry talią zawierającą karty Shinobi Shiren',
    text_ja: '忍びの試練のカードを含むデッキで3勝する',
  },

  {
    id: 'ss-attach-weapon-25', level: 2, target: 25,
    text_fr: "équiper 25 armes à vos personnages",
    text_en: 'attach 25 weapons to your characters',
    text_es: 'equipa 25 armas a tus personajes',
    text_pt: 'equipe 25 armas aos seus personagens',
    text_it: 'equipaggia 25 armi ai tuoi personaggi',
    text_pl: 'załóż 25 broni swoim postaciom',
    text_ja: 'キャラクターに武器を25回装備させる',
  },
  {
    id: 'ss-steal-attachment-10', level: 2, target: 10,
    text_fr: "prendre le contrôle de 10 personnages équipés",
    text_en: 'take control of 10 equipped characters',
    text_es: 'toma el control de 10 personajes equipados',
    text_pt: 'tome o controle de 10 personagens equipados',
    text_it: 'prendi il controllo di 10 personaggi equipaggiati',
    text_pl: 'przejmij kontrolę nad 10 wyposażonymi postaciami',
    text_ja: '装備したキャラクターを10体奪う',
  },
  {
    id: 'ss-duel-20', level: 2, target: 20,
    text_fr: "résoudre 20 effets DUEL",
    text_en: 'resolve 20 DUEL effects',
    text_es: 'resuelve 20 efectos DUEL',
    text_pt: 'resolva 20 efeitos DUEL',
    text_it: 'risolvi 20 effetti DUEL',
    text_pl: 'rozpatrz 20 efektów DUEL',
    text_ja: 'DUEL効果を20回解決する',
  },
  {
    id: 'ss-blank-text-10', level: 2, target: 10,
    text_fr: "réduire au silence 10 personnages ennemis",
    text_en: 'silence 10 enemy characters',
    text_es: 'silencia a 10 personajes enemigos',
    text_pt: 'silencie 10 personagens inimigos',
    text_it: 'zittisci 10 personaggi nemici',
    text_pl: 'wycisz 10 wrogich postaci',
    text_ja: '敵キャラクター10体の効果を消す',
  },
  {
    id: 'ss-search-deck-15', level: 2, target: 15,
    text_fr: "fouiller le dessus de votre deck 15 fois",
    text_en: 'look at the top of your deck 15 times',
    text_es: 'mira la parte superior de tu mazo 15 veces',
    text_pt: 'olhe o topo do seu deck 15 vezes',
    text_it: 'guarda in cima al tuo mazzo 15 volte',
    text_pl: 'podejrzyj wierzch swojej talii 15 razy',
    text_ja: '山札の上を15回確認する',
  },
  {
    id: 'ss-win-mission-double-3', level: 2, target: 3,
    text_fr: "remporter 3 fois une mission qui compte double",
    text_en: 'win a mission that scores twice, 3 times',
    text_es: 'gana 3 veces una misión que puntúa doble',
    text_pt: 'vença 3 vezes uma missão que pontua em dobro',
    text_it: 'vinci 3 volte una missione che vale doppio',
    text_pl: 'wygraj 3 razy misję liczoną podwójnie',
    text_ja: '2回得点するミッションを3回制する',
  },

  {
    id: 'ss-first-strike-30', level: 3, target: 30,
    text_fr: "déclencher 30 effets FIRST STRIKE",
    text_en: 'trigger 30 FIRST STRIKE effects',
    text_es: 'activa 30 efectos FIRST STRIKE',
    text_pt: 'ative 30 efeitos FIRST STRIKE',
    text_it: 'attiva 30 effetti FIRST STRIKE',
    text_pl: 'uruchom 30 efektów FIRST STRIKE',
    text_ja: 'FIRST STRIKE効果を30回発動する',
  },
  {
    id: 'ss-attachment-defeat-20', level: 3, target: 20,
    text_fr: "vaincre 20 personnages portant un équipement",
    text_en: 'defeat 20 characters carrying equipment',
    text_es: 'derrota a 20 personajes con equipo',
    text_pt: 'derrote 20 personagens com equipamento',
    text_it: 'sconfiggi 20 personaggi con un equipaggiamento',
    text_pl: 'pokonaj 20 postaci z wyposażeniem',
    text_ja: '装備を持つキャラクターを20体倒す',
  },
  {
    id: 'ss-sound-four-mission-10', level: 3, target: 10,
    text_fr: "remporter 10 missions avec au moins trois Quatre du Son",
    text_en: 'win 10 missions with at least three Sound Four characters',
    text_es: 'gana 10 misiones con al menos tres del Cuarteto del Sonido',
    text_pt: 'vença 10 missões com ao menos três do Quarteto do Som',
    text_it: 'vinci 10 missioni con almeno tre del Quartetto del Suono',
    text_pl: 'wygraj 10 misji mając co najmniej trzy postacie Czwórki Dźwięku',
    text_ja: '音の四人衆を3体以上並べてミッションを10回制する',
  },
  {
    id: 'ss-copy-upgrade-10', level: 3, target: 10,
    text_fr: "copier 10 effets UPGRADE",
    text_en: 'copy 10 UPGRADE effects',
    text_es: 'copia 10 efectos UPGRADE',
    text_pt: 'copie 10 efeitos UPGRADE',
    text_it: 'copia 10 effetti UPGRADE',
    text_pl: 'skopiuj 10 efektów UPGRADE',
    text_ja: 'UPGRADE効果を10回コピーする',
  },
  {
    id: 'ss-win-ranked-15', level: 3, target: 15,
    text_fr: "gagner 15 parties classées",
    text_en: 'win 15 ranked games',
    text_es: 'gana 15 partidas clasificatorias',
    text_pt: 'vença 15 partidas ranqueadas',
    text_it: 'vinci 15 partite classificate',
    text_pl: 'wygraj 15 gier rankingowych',
    text_ja: 'ランク戦で15勝する',
  },
  {
    id: 'ss-hidden-reveal-25', level: 3, target: 25,
    text_fr: "révéler 25 personnages posés face cachée",
    text_en: 'reveal 25 face-down characters',
    text_es: 'revela 25 personajes bocabajo',
    text_pt: 'revele 25 personagens virados',
    text_it: 'rivela 25 personaggi coperti',
    text_pl: 'odkryj 25 zakrytych postaci',
    text_ja: '裏向きのキャラクターを25体表にする',
  },

  {
    id: 'ss-season-tier-60', level: 4, target: 60,
    text_fr: "atteindre le dernier palier de la saison",
    text_en: 'reach the final tier of the season',
    text_es: 'alcanza el último nivel de la temporada',
    text_pt: 'alcance o último nível da temporada',
    text_it: "raggiungi l'ultimo livello della stagione",
    text_pl: 'osiągnij ostatni poziom sezonu',
    text_ja: 'シーズン最後のティアに到達する',
  },
  {
    id: 'ss-collect-chibi-15', level: 4, target: 15,
    text_fr: "réunir les 15 chibis de la saison",
    text_en: 'collect all 15 chibis of the season',
    text_es: 'reúne los 15 chibis de la temporada',
    text_pt: 'reúna os 15 chibis da temporada',
    text_it: 'colleziona i 15 chibi della stagione',
    text_pl: 'zbierz wszystkie 15 chibi sezonu',
    text_ja: 'シーズンのチビ15種をすべて集める',
  },
  {
    id: 'ss-win-mono-sound-10', level: 4, target: 10,
    text_fr: "gagner 10 parties avec un deck entièrement Village du Son",
    text_en: 'win 10 games with a full Sound Village deck',
    text_es: 'gana 10 partidas con un mazo íntegro de la Aldea del Sonido',
    text_pt: 'vença 10 partidas com um deck inteiro da Vila do Som',
    text_it: 'vinci 10 partite con un mazzo interamente del Villaggio del Suono',
    text_pl: 'wygraj 10 gier talią wyłącznie z Wioski Dźwięku',
    text_ja: '音隠れの里だけのデッキで10勝する',
  },
  {
    id: 'ss-perfect-sweep-5', level: 4, target: 5,
    text_fr: "gagner 5 parties en remportant toutes les missions",
    text_en: 'win 5 games taking every mission',
    text_es: 'gana 5 partidas llevándote todas las misiones',
    text_pt: 'vença 5 partidas levando todas as missões',
    text_it: 'vinci 5 partite conquistando tutte le missioni',
    text_pl: 'wygraj 5 gier, zdobywając wszystkie misje',
    text_ja: '全ミッションを制して5勝する',
  },
  {
    id: 'ss-tournament-win-set2', level: 4, target: 1,
    text_fr: "gagner un tournoi avec un deck contenant du Shinobi Shiren",
    text_en: 'win a tournament with a deck containing Shinobi Shiren cards',
    text_es: 'gana un torneo con un mazo que incluya cartas de Shinobi Shiren',
    text_pt: 'vença um torneio com um deck contendo cartas de Shinobi Shiren',
    text_it: 'vinci un torneo con un mazzo che contiene carte di Shinobi Shiren',
    text_pl: 'wygraj turniej talią zawierającą karty Shinobi Shiren',
    text_ja: '忍びの試練のカードを含むデッキで大会に優勝する',
  },
  {
    id: 'ss-open-boosters-60', level: 4, target: 60,
    text_fr: "ouvrir 60 boosters de la saison",
    text_en: 'open 60 boosters of the season',
    text_es: 'abre 60 sobres de la temporada',
    text_pt: 'abra 60 boosters da temporada',
    text_it: 'apri 60 buste della stagione',
    text_pl: 'otwórz 60 boosterów sezonu',
    text_ja: 'シーズンのブースターを60パック開封する',
  },
];

export function texteDeQuete(quete: QueteAnnoncee, locale: string): string {
  const cle = `text_${locale}` as keyof QueteAnnoncee;
  const valeur = quete[cle];
  return typeof valeur === 'string' && valeur ? valeur : quete.text_en;
}
