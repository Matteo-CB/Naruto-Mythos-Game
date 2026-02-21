// English translations of card effect descriptions
// Card ID -> array of effect descriptions in English (matching the order of effects in the JSON)
// Game-specific terms (POWERUP, CHAKRA, [⧗], [↯]) are kept as-is.

export const effectDescriptionsEn: Record<string, string[]> = {
  // =====================
  // COMMON (C)
  // =====================

  // 001/130 - HIRUZEN SARUTOBI (C) - "The Professor"
  '001/130': [
    'POWERUP 2 another friendly Leaf Village character.',
  ],

  // 003/130 - TSUNADE (C) - "Master Medical Ninja"
  '003/130': [
    '[⧗] When any friendly character is defeated, gain 2 Chakra.',
  ],

  // 005/130 - SHIZUNE (C) - "Tsunade\'s Assistant"
  '005/130': [
    '[⧗] CHAKRA +1.',
  ],

  // 007/130 - JIRAIYA (C) - "Toad Sage"
  '007/130': [
    'Play a Summon character anywhere, paying 1 less.',
  ],

  // 011/130 - SAKURA HARUNO (C) - "Team 7 Genin"
  '011/130': [
    'If there\'s another Team 7 character in this mission, draw a card.',
  ],

  // 013/130 - SASUKE UCHIHA (C) - "Last of the Uchiha Clan"
  '013/130': [
    '[⧗] This character has -1 Power for every other non-hidden friendly character in this mission.',
  ],

  // 015/130 - KAKASHI HATAKE (C) - "Team 7 Sensei"
  '015/130': [
    '[⧗] Other Team 7 characters in this mission have +1 Power.',
  ],

  // 017/130 - CHOJI AKIMICHI (C) - "Expansion Jutsu"
  '017/130': [
    'POWERUP 3.',
  ],

  // 019/130 - INO YAMANAKA (C) - "Team 10 Genin"
  '019/130': [
    'If there\'s another Team 10 character in this mission, POWERUP 1.',
  ],

  // 021/130 - SHIKAMARU NARA (C) - "Team 10 Genin"
  '021/130': [
    'If you have the Edge, draw a card.',
  ],

  // 023/130 - ASUMA SARUTOBI (C) - "Team 10 Sensei"
  '023/130': [
    'Move another Team 10 character from this mission.',
  ],

  // 025/130 - KIBA INUZUKA (C) - "Team 8 Genin"
  '025/130': [
    '[⧗] If [u]Akamaru[/u] is in the same mission, CHAKRA +1.',
  ],

  // 027/130 - AKAMARU (C) - "Ninja Dog"
  '027/130': [
    '[⧗] If there isn\'t a [u]Kiba Inuzuka[/u] in this mission at the end of the round, you must return this character to your hand.',
  ],

  // 030/130 - HINATA HYUGA (C) - "Gentle Fist"
  '030/130': [
    'Remove up to 2 Power tokens from an enemy character in play.',
  ],

  // 032/130 - SHINO ABURAME (C) - "Parasitic Insects"
  '032/130': [
    'Each player draws a card.',
  ],

  // 034/130 - KURENAI YUHI (C) - "Team 8 Sensei"
  '034/130': [
    '[⧗] Other Team 8 characters cost 1 less (min. 1) to play in this mission.',
  ],

  // 036/130 - NEJI HYUGA (C) - "Gentle Fist"
  '036/130': [
    'Remove up to 2 Power tokens from an enemy character in play.',
  ],

  // 038/130 - ROCK LEE (C) - "Strong Fist Training"
  '038/130': [
    'POWERUP 1.',
  ],

  // 040/130 - TENTEN (C) - "Team Guy Genin"
  '040/130': [
    '[⧗] You can play this character only in a mission where you are currently winning.',
  ],

  // 042/130 - GAI MAITO (C) - "Team Guy Sensei"
  '042/130': [
    '[⧗] Other Team Guy characters in this mission have +1 Power.',
  ],

  // 044/130 - ANKO MITARASHI (C) - "Chunin Exam Proctor"
  '044/130': [
    '[⧗] If you have at least one other friendly Leaf Village character in this mission, CHAKRA +1.',
  ],

  // 046/130 - EBISU (C) - "Elite Trainer"
  '046/130': [
    'If there is a friendly non-hidden character with less Power than this character in this mission, draw a card.',
  ],

  // 047/130 - IRUKA (C) - "Academy Instructor"
  '047/130': [
    'Move a [u]Naruto Uzumaki[/u] character in play.',
  ],

  // 048/130 - HAYATE GEKKO (C) - "Talented Shinobi"
  '048/130': [
    '[⧗] If this character would be defeated, hide it instead.',
  ],

  // 049/130 - GEMMA SHIRANUI (C) - "Elite Guard"
  '049/130': [
    '[⧗] If a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you can defeat this character instead.',
  ],

  // 050/130 - OROCHIMARU (C) - "Infiltrator"
  '050/130': [
    'Look at a hidden enemy character in this mission. If it costs 3 or less, take control of that character and move it to your side.',
  ],

  // 052/130 - KABUTO YAKUSHI (C) - "The Mole"
  '052/130': [
    'Draw the top card of the opponent\'s deck and put it hidden in any mission under your control.',
  ],

  // 055/130 - KIMIMARO (C) - "Dance of the Camellia"
  '055/130': [
    'Discard a card to hide a character in play with cost 3 or less.',
  ],

  // 057/130 - JIROBO (C) - "Curse Mark Bearer"
  '057/130': [
    'POWERUP X. X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 059/130 - KIDOMARU (C) - "Curse Mark Bearer"
  '059/130': [
    'Move X friendly character(s). X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 061/130 - SAKON (C) - "Curse Mark Bearer"
  '061/130': [
    'Draw X card(s). X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 064/130 - TAYUYA (C) - "Curse Mark Bearer"
  '064/130': [
    '[⧗] CHAKRA +X. X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 068/130 - DOSU KINUTA (C) - "Superhuman Hearing"
  '068/130': [
    'Look at a hidden character in play.',
    'Defeat a hidden character in play.',
  ],

  // 070/130 - ZAKU ABUMI (C) - "Overconfident Shinobi"
  '070/130': [
    'Opponent gains 1 Chakra.',
  ],

  // 072/130 - KIN TSUCHI (C) - "Kunoichi"
  '072/130': [
    'Opponent draws a card.',
  ],

  // 074/130 - GAARA (C) - "Sand Village Genin"
  '074/130': [
    'POWERUP X where X is the number of friendly hidden characters in this mission.',
  ],

  // 075/130 - GAARA (C) - "Sand Shield"
  '075/130': [
    '[⧗] If this character would be moved or defeated by enemy effects, hide them instead.',
    '[⧗] You can play this character while hidden paying 2 less.',
  ],

  // 077/130 - KANKURO (C) - "Chakra Strings"
  '077/130': [
    '[⧗] If there\'s at least one non-hidden enemy character in this mission, CHAKRA +1.',
  ],

  // 079/130 - TEMARI (C) - "Kunoichi"
  '079/130': [
    '[⧗] If you have the Edge, this character has +2 Power.',
  ],

  // 081/130 - BAKI (C) - "Council Agent"
  '081/130': [
    '[↯] Draw a card.',
  ],

  // 084/130 - YASHAMARU (C) - "Gaara\'s Caretaker"
  '084/130': [
    '[⧗] This character has +2 Power if there\'s a friendly [u]Gaara[/u] in this mission.',
  ],

  // 088/130 - HAKU (C) - "Orphan of the Land of Water"
  '088/130': [
    'Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.',
  ],

  // 090/130 - ITACHI UCHIHA (C) - "Akatsuki"
  '090/130': [
    '[⧗] If there is a [u]Sasuke Uchiha[/u] in this mission, you can play this character while hidden paying 3 less.',
  ],

  // 092/130 - KISAME HOSHIGAKI (C) - "Rogue Ninja of the Hidden Mist"
  '092/130': [
    'Remove up to 2 Power tokens from an enemy character in this mission and put them on this character.',
  ],

  // 094/130 - GAMABUNTA (C) - "Chief Toad"
  '094/130': [
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 095/130 - GAMAHIRO (C) - "Armed Toad"
  '095/130': [
    'If there\'s a friendly character in this mission, draw a card.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 096/130 - GAMAKICHI (C) - "Gamabunta\'s Eldest Son"
  '096/130': [
    '[⧗] Pay 1 less to play this character if there\'s a friendly [u]Naruto Uzumaki[/u] in this mission.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 097/130 - GAMATATSU (C) - "Gamabunta\'s Youngest Son"
  '097/130': [
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 098/130 - KATSUYU (C) - "Giant Slug"
  '098/130': [
    'If there is a friendly [u]Tsunade[/u] in play, POWERUP 2.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 099/130 - PAKKUN (C) - "Kakashi\'s Ninja Dog"
  '099/130': [
    '[↯] Move this character.',
  ],

  // 100/130 - NINJA HOUNDS (C) - "Kakashi\'s Ninja Dogs"
  '100/130': [
    '[⧗] When this character moves to a different mission, look at a hidden character in that mission.',
  ],

  // 101/130 - TON TON (C) - "Tsunade\'s Ninja Pig"
  '101/130': [
    '[⧗] If there\'s a friendly [u]Tsunade[/u] or [u]Shizune[/u] in this mission, this character has +1 Power.',
  ],

  // =====================
  // UNCOMMON (UC)
  // =====================

  // 002/130 - HIRUZEN SARUTOBI (UC) - "Third Hokage"
  '002/130': [
    'Play a Leaf Village character anywhere paying 1 less.',
    'POWERUP 2 the character played with the MAIN effect.',
  ],

  // 004/130 - TSUNADE (UC) - "Creation Rebirth"
  '004/130': [
    '[⧗] Defeated friendly characters go into your hand instead of your discard pile.',
    'Choose one character in your discard pile and put them into your hand.',
  ],

  // 006/130 - SHIZUNE (UC) - "Poison Mist"
  '006/130': [
    'Move an enemy character with Power 3 or less from this mission.',
    'Gain 2 additional Chakra.',
  ],

  // 008/130 - JIRAIYA (UC) - "Summoning Jutsu"
  '008/130': [
    'Play a Summon character anywhere, paying 2 less.',
    'MAIN effect: In addition, hide an enemy character with cost 3 or less in this mission.',
  ],

  // 010/130 - NARUTO UZUMAKI (UC) - "Sexy Jutsu"
  '010/130': [
    'Move this character.',
  ],

  // 012/130 - SAKURA HARUNO (UC) - "Inner Sakura"
  '012/130': [
    '[⧗] CHAKRA +1.',
    'Draw a card, then discard a card.',
  ],

  // 014/130 - SASUKE UCHIHA (UC) - "Sharingan"
  '014/130': [
    'Look at a random card in the opponent\'s hand.',
    'Discard the card you looked at and the opponent draws a card.',
  ],

  // 016/130 - KAKASHI HATAKE (UC) - "Copy Ninja"
  '016/130': [
    'Copy the instant effect of an enemy character with cost 4 or less in this mission.',
    'MAIN effect: Instead, there is no cost limit.',
  ],

  // 018/130 - CHOJI AKIMICHI (UC) - "Expansion Jutsu"
  '018/130': [
    '[⧗] When this character moves, hide it.',
    'Move this character.',
  ],

  // 020/130 - INO YAMANAKA (UC) - "Mind Transfer Jutsu"
  '020/130': [
    'Take control of an enemy character with cost 2 or less in this mission.',
    'MAIN effect: Instead, the cost limit is 3.',
  ],

  // 022/130 - SHIKAMARU NARA (UC) - "Shadow Possession Jutsu"
  '022/130': [
    'Move an enemy character from the mission that was just revealed to this mission.',
  ],

  // 024/130 - ASUMA SARUTOBI (UC) - "Flying Swallow"
  '024/130': [
    'Draw a card, then discard a card. POWERUP 3 if you discarded a Team 10 character.',
  ],

  // 026/130 - KIBA INUZUKA (UC) - "Fang Over Fang"
  '026/130': [
    'Hide the lowest cost enemy character in this mission.',
    'MAIN effect: In addition, search your deck for [u]Akamaru[/u] and play it in this mission for free.',
  ],

  // 028/130 - AKAMARU (UC) - "Man Beast Clone"
  '028/130': [
    '[⧗] If there isn\'t a [u]Kiba Inuzuka[/u] in this mission at the end of the round, return this character to your hand.',
    'POWERUP 2 a friendly [u]Kiba Inuzuka[/u] in this mission.',
  ],

  // 029/130 - AKAMARU (UC) - "Dynamic Marking"
  '029/130': [
    '[⧗] You can play this character as an upgrade over [u]Kiba Inuzuka[/u].',
    'Hide the lowest cost enemy character in this mission.',
  ],

  // 031/130 - HINATA HYUGA (UC) - "Byakugan"
  '031/130': [
    '[⧗] When an enemy character is played in this mission, gain 1 Chakra.',
  ],

  // 033/130 - SHINO ABURAME (UC) - "Parasitic Insects"
  '033/130': [
    'All characters played by the opponent cost 1 more this turn.',
    'Move this character.',
  ],

  // 035/130 - KURENAI YUHI (UC) - "Demonic Illusion"
  '035/130': [
    '[⧗] Characters can\'t be moved from this mission.',
    'Defeat an enemy character with Power 1 or less in this mission.',
  ],

  // 037/130 - NEJI HYUGA (UC) - "Eight Trigrams"
  '037/130': [
    '[⧗] When an enemy character is played in this mission, POWERUP 1.',
    'Remove up to 3 Power tokens from an enemy character in play.',
  ],

  // 039/130 - ROCK LEE (UC) - "Primary Lotus"
  '039/130': [
    '[⧗] This character doesn\'t lose its Power tokens at the end of the round.',
    'POWERUP 2.',
  ],

  // 041/130 - TENTEN (UC) - "Rising Twin Dragons"
  '041/130': [
    'Defeat a hidden character in this mission.',
    'POWERUP 1 another friendly Leaf Village character in this mission.',
  ],

  // 043/130 - GAI MAITO (UC) - "Dynamic Entry"
  '043/130': [
    '[⧗] This character doesn\'t lose its Power tokens at the end of the round.',
    'POWERUP 3.',
  ],

  // 045/130 - ANKO MITARASHI (UC) - "Hidden Shadow Snake Hands"
  '045/130': [
    'Defeat a hidden enemy character in play.',
  ],

  // 051/130 - OROCHIMARU (UC) - "Sannin"
  '051/130': [
    '[⧗] At the end of each Mission Phase, if you lost a mission where this character is assigned, move this character to the next unresolved mission.',
    'Defeat a hidden enemy character in this mission.',
  ],

  // 053/130 - KABUTO YAKUSHI (UC) - "Dead Soul Jutsu"
  '053/130': [
    'Draw a card.',
    'Play a character from your discard pile anywhere, paying its cost minus 3.',
  ],

  // 054/130 - KABUTO YAKUSHI (UC) - "Chakra Scalpel"
  '054/130': [
    'POWERUP 1.',
    'Hide all non-hidden enemy characters with Power less than this character in this mission.',
  ],

  // 056/130 - KIMIMARO (UC) - "Bone Pulse"
  '056/130': [
    '[⧗] Enemy characters cost 1 more to play in this mission.',
    'Discard a card to hide a character in play with cost 5 or less.',
  ],

  // 058/130 - JIROBO (UC) - "Earth Barrier"
  '058/130': [
    'POWERUP 1 each friendly Sound Four character in play.',
    'MAIN effect: Instead, POWERUP 1 each friendly Sound Four character in every mission.',
  ],

  // 060/130 - KIDOMARU (UC) - "Spider Web"
  '060/130': [
    'Move a friendly character from this mission.',
    'Defeat an enemy character with Power 1 or less in this mission.',
  ],

  // 062/130 - SAKON (UC) - "Parasite Demon"
  '062/130': [
    'Copy the instant effect of a friendly Sound Four character in play.',
  ],

  // 063/130 - UKON (UC) - "Parasite Demon"
  '063/130': [
    '[⧗] You can play this character as an upgrade over any Sound Village character.',
  ],

  // 065/130 - TAYUYA (UC) - "Demon Flute"
  '065/130': [
    'POWERUP 2 a friendly Sound character in play.',
    'Search your deck for a Summon character and play it in this mission for free.',
  ],

  // 066/130 - DOKI (UC) - "Demon"
  '066/130': [
    'Steal 1 Chakra from the opponent if there is a friendly Sound Four character in play.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 067/130 - REMPART (UC) - "Barrier"
  '067/130': [
    '[⧗] The strongest non-hidden enemy character in this mission has Power 0.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 069/130 - DOSU KINUTA (UC) - "Melody Arm"
  '069/130': [
    'Look at a hidden character in play.',
    'Force an enemy hidden character in this mission to reveal itself or be defeated.',
  ],

  // 071/130 - ZAKU ABUMI (UC) - "Slicing Sound Wave"
  '071/130': [
    'If you have fewer characters in this mission than the opponent, move an enemy character from this mission.',
    'POWERUP 2.',
  ],

  // 073/130 - KIN TSUCHI (UC) - "Bell Needles"
  '073/130': [
    'Discard a card to hide an enemy character with Power 4 or less in this mission.',
    'MAIN effect: Instead, put the top card of your deck as a hidden character in this mission.',
  ],

  // 076/130 - ICHIBI (UC) - "One-Tail"
  '076/130': [
    '[⧗] You can play this character as an upgrade over [u]Gaara[/u].',
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
  ],

  // 078/130 - KANKURO (UC) - "Puppet Master"
  '078/130': [
    'Move an enemy character with Power 4 or less to this mission.',
    'Play a character while hidden in this mission, paying 1 less.',
  ],

  // 080/130 - TEMARI (UC) - "Wind Scythe Jutsu"
  '080/130': [
    'Move a friendly Sand Village character in play.',
    'Move this character.',
  ],

  // 082/130 - BAKI (UC) - "Blade of Wind"
  '082/130': [
    '[↯] Defeat a hidden enemy character in play.',
    'POWERUP 1 each friendly Sand Village character in this mission.',
  ],

  // 083/130 - RASA (UC) - "Fourth Kazekage"
  '083/130': [
    '[↯] Gain 1 additional Mission point if there is a friendly Sand Village character in this mission.',
  ],

  // 085/130 - YASHAMARU (UC) - "Gaara\'s Caretaker"
  '085/130': [
    '[↯] Defeat this character and another character in this mission.',
  ],

  // 087/130 - ZABUZA MOMOCHI (UC) - "Demon of the Mist"
  '087/130': [
    'If there is only one enemy character in this mission, hide it.',
    'MAIN effect: Instead, defeat it.',
  ],

  // 089/130 - HAKU (UC) - "Crystal Ice Mirrors"
  '089/130': [
    'Discard the top X cards of the opponent\'s deck, where X is the number of friendly characters in this mission. POWERUP X.',
    'MAIN effect: Instead, discard from your own deck.',
  ],

  // 091/130 - ITACHI UCHIHA (UC) - "Mangekyo Sharingan"
  '091/130': [
    'Look at a random card in the opponent\'s hand.',
    'MAIN effect: In addition, the opponent discards that card and draws a card.',
  ],

  // 093/130 - KISAME HOSHIGAKI (UC) - "Samehada"
  '093/130': [
    'Steal up to 2 Power tokens from an enemy character and put them on this character.',
    'MAIN effect: In addition, steal from any mission.',
  ],

  // 102/130 - MANDA (UC) - "King of Snakes"
  '102/130': [
    'Defeat a Summon character in play.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 103/130 - KYODAIGUMO (UC) - "Giant Spider"
  '103/130': [
    '[⧗] At the end of the round, hide this character and return it to your hand.',
  ],

  // =====================
  // RARE (R)
  // =====================

  // 104/130 - TSUNADE (R) - "Chakra Enhanced Strength"
  '104/130': [
    'Spend any amount of additional Chakra. POWERUP X, where X is the amount of additional Chakra spent.',
    'POWERUP X.',
  ],

  // 105/130 - JIRAIYA (R) - "Earth Style: Mud Wall"
  '105/130': [
    'Play a Summon character anywhere, paying 3 less.',
    'Move any enemy character from this mission.',
  ],

  // 106/130 - KAKASHI HATAKE (R) - "Curse Sealing"
  '106/130': [
    'Discard the top card of an upgraded enemy character in play.',
    'MAIN effect: Copy any non-Upgrade instant effect from the discarded enemy character.',
  ],

  // 107/130 - SASUKE UCHIHA (R) - "Chidori"
  '107/130': [
    'You must move all other non-hidden friendly characters from this mission, if able.',
    'POWERUP X where X is the number of characters moved this way.',
  ],

  // 108/130 - NARUTO UZUMAKI (R) - "Shadow Clone Jutsu"
  '108/130': [
    'Put the top card of your deck as a hidden character in this mission.',
    'Repeat the MAIN effect.',
  ],
  '108/130 A': [
    'Put the top card of your deck as a hidden character in this mission.',
    'Repeat the MAIN effect.',
  ],

  // 109/130 - SAKURA HARUNO (R) - "Medical Ninja"
  '109/130': [
    'Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.',
    'MAIN effect: Instead, play the card paying 2 less.',
  ],

  // 110/130 - INO YAMANAKA (R) - "Mind Destruction"
  '110/130': [
    'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.',
    'MAIN effect: After moving, hide the enemy character.',
  ],
  '110/130 A': [
    'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.',
    'MAIN effect: After moving, hide the enemy character.',
  ],

  // 111/130 - SHIKAMARU NARA (R) - "Shadow Strangle Jutsu"
  '111/130': [
    '[⧗] The opponent cannot play characters while hidden in this mission.',
    'Hide an enemy character with Power 3 or less in this mission.',
  ],

  // 112/130 - CHOJI AKIMICHI (R) - "Butterfly Bombing"
  '112/130': [
    'Discard a card from your hand. POWERUP X where X is the cost of the discarded card.',
    'Repeat the MAIN effect.',
  ],

  // 113/130 - KIBA INUZUKA (R) - "Fang Over Fang"
  '113/130': [
    'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.',
    'MAIN effect: Instead, defeat both of them.',
  ],

  // 113b/130 - ASUMA SARUTOBI (R) - "Flying Swallow"
  '113b/130': [
    'Draw a card.',
    'Discard a card to defeat a character with Power X or less in play, where X is the Power of the discarded card.',
  ],

  // 114/130 - HINATA HYUGA (R) - "Protective Eight Trigrams Sixty-Four Palms"
  '114/130': [
    'POWERUP 2. POWERUP 1 another character.',
    'Remove all Power tokens from an enemy character in play.',
  ],
  '114/130 A': [
    'POWERUP 2. POWERUP 1 another character.',
    'Remove all Power tokens from an enemy character in play.',
  ],

  // 116/130 - NEJI HYUGA (R) - "Eight Trigrams Sixty-Four Palms"
  '116/130': [
    'Defeat a character in this mission with exactly Power 4.',
    'Defeat a character with exactly Power 6 in this mission.',
  ],
  '116/130 A': [
    'Defeat a character in this mission with exactly Power 4.',
    'Defeat a character with exactly Power 6 in this mission.',
  ],

  // 116b/130 - KURENAI YUHI (R) - "Flower Petal Escape"
  '116b/130': [
    'Defeat an enemy character with Power 4 or less in this mission.',
    'Move this character.',
  ],

  // 117/130 - ROCK LEE (R) - "Loopy Fist"
  '117/130': [
    '[⧗] At the end of the round, you must move this character to another mission, if able.',
    'Reveal and discard the top card of your deck: POWERUP X where X is the cost of the discarded card.',
  ],

  // 118/130 - TENTEN (R) - "Rising Twin Dragons"
  '118/130': [
    'Defeat a hidden character in this mission. If the defeated character had a printed Power of 3 or less, defeat a hidden character in play.',
  ],
  '118/130 A': [
    'Defeat a hidden character in this mission. If the defeated character had a printed Power of 3 or less, defeat a hidden character in play.',
  ],

  // 119/130 - KANKURO (R) - "Secret Black Move: Iron Maiden"
  '119/130': [
    'Move any character in play.',
    'Defeat an enemy character with Power 3 or less in this mission.',
  ],

  // 119b/130 - MIGHT GUY (R) - "Gate of Opening"
  '119b/130': [
    'POWERUP 3.',
    'Discard a card. If you do so, move any number of non-hidden enemy characters in play with total Power of the Power of this character or less.',
  ],

  // 120/130 - GAARA (R) - "Sand Coffin"
  '120/130': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],
  '120/130 A': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],

  // 121/130 - TEMARI (R) - "Wind Scythe Jutsu"
  '121/130': [
    'Move any friendly character in play.',
    'Move any character in play.',
  ],

  // 122/130 - JIROBO (R) - "Arhat Fist"
  '122/130': [
    'POWERUP X where X is the number of characters in this mission.',
    'Defeat an enemy character with Power 1 or less in this mission.',
  ],

  // 123/130 - KIMIMARO (R) - "Earth Curse Mark"
  '123/130': [
    '[⧗] At the end of the round, you must defeat this character if you have no cards in hand.',
    'Discard a card to defeat a character in play with cost 5 or less.',
  ],

  // 124/130 - KIDOMARU (R) - "Spider Bow: Fierce Rip"
  '124/130': [
    'Defeat an enemy character with Power 3 or less in another mission.',
    'AMBUSH effect: Instead, the Power limit is 5 or less.',
  ],

  // 124b/130 - UKON (R) - "Multiple Fists Barrage"
  '124b/130': [
    '[⧗] You can play this character as an upgrade over any Sound Village character.',
    'Hide an enemy character in this mission with Power 5 or less.',
  ],

  // 125/130 - TAYUYA (R) - "Demon Flute: Chains of Fantasia"
  '125/130': [
    '[⧗] Non-hidden enemy characters cost an additional 1 Chakra to play in this mission.',
    'Play a Sound Village character, paying 2 less.',
  ],

  // 126/130 - OROCHIMARU (R) - "Sword of Kusanagi"
  '126/130': [
    'Defeat the weakest non-hidden enemy character in play.',
    'POWERUP 3.',
  ],

  // 128/130 - ITACHI UCHIHA (R) - "Amaterasu"
  '128/130': [
    'Move a friendly character in play.',
    '[⧗] Every enemy character in this mission has -1 Power.',
  ],

  // 129/130 - KYUBI (R) - "Demon Fox Cloak"
  '129/130': [
    '[⧗] You can play this character as an upgrade over [u]Naruto Uzumaki[/u].',
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
  ],

  // 130/130 - ICHIBI (R) - "Gaara Playing Possum Jutsu"
  '130/130': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Choose a mission and defeat all hidden enemy characters assigned to it.',
  ],
  '130/130 A': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Choose a mission and defeat all hidden enemy characters assigned to it.',
  ],

  // =====================
  // SECRET (S)
  // =====================

  // 131/130 - TSUNADE (S) - "Fifth Hokage"
  '131/130': [
    'POWERUP 1 every friendly Leaf Village character in play.',
  ],

  // 132/130 - JIRAIYA (S) - "Inside the Toad"
  '132/130': [
    'Play a Summon character anywhere, paying 5 less.',
    'The opponent must choose characters to be defeated until they only have up to 2 assigned in each mission.',
  ],

  // 133/130 - NARUTO UZUMAKI (S) - "Rasengan"
  '133/130': [
    'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.',
    'effect: Instead, defeat both of them.',
  ],

  // 134/130 - KYUBI (S) - "Destruction"
  '134/130': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Hide any number of non-hidden characters in play with total Power of 6 or less.',
  ],

  // 135/130 - SAKURA HARUNO (S) - "Leaf Village Medical Corps"
  '135/130': [
    'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.',
    'effect: Instead, play the card paying 4 less.',
  ],

  // 136/130 - SASUKE UCHIHA (S) - "Heaven Curse Mark"
  '136/130': [
    '[⧗] When a character is defeated, gain 1 Chakra.',
    'You must choose a friendly non-hidden character and any enemy character in this mission and defeat them, if able.',
  ],

  // 137/130 - KAKASHI HATAKE (S) - "Lightning Blade"
  '137/130': [
    'Move this character.',
    'Hide an upgraded character in this mission.',
  ],

  // 138/130 - OROCHIMARU (S) - "Summoning: Impure World Reincarnation"
  '138/130': [
    '[⧗] You can play this character as an upgrade to any character that is not a Summon nor Orochimaru.',
    'Gain 2 Mission points if the character you upgraded from had Power 6 or more.',
  ],

  // 139/130 - GAARA (S) - "Desert Coffin"
  '139/130': [
    'Defeat an enemy character with a cost less than the number of friendly hidden characters in play.',
    'MAIN effect: In addition, hide one other enemy character with same name and cost less than the defeated character.',
  ],

  // 140/130 - ITACHI UCHIHA (S) - "Tsukuyomi"
  '140/130': [
    'The opponent discards their entire hand, then draws the same number of cards discarded this way.',
    'Defeat a character in play with cost X or less, where X is the number of cards discarded by the MAIN effect.',
  ],

  // =====================
  // MYTHOS (M)
  // =====================

  // 141/130 - NARUTO UZUMAKI (M) - "Defying Sasuke"
  '141/130': [
    'Discard a card. If you do, hide an enemy character with Power 4 or less in this mission.',
  ],

  // 142/130 - SASUKE UCHIHA (M) - "Defying Naruto"
  '142/130': [
    'Discard a card. If you do, POWERUP X+1 where X is the number of enemy characters in this mission.',
  ],

  // 143/130 - ITACHI UCHIHA (M) - "Hunting Naruto"
  '143/130': [
    'Move a friendly character to this mission.',
    'Move an enemy character to this mission.',
  ],

  // 144/130 - KISAME HOSHIGAKI (M) - "Chakra Absorption"
  '144/130': [
    'Steal 1 Chakra from the opponent\'s pool.',
  ],

  // 145/130 - NARUTO UZUMAKI (M) - "Original Team 7"
  '145/130': [
    '[⧗] If you have the Edge, your hidden characters in this mission have +1 Power.',
  ],

  // 146/130 - SASUKE UCHIHA (M) - "Original Team 7"
  '146/130': [
    'Give the Edge to the opponent. If you do so, POWERUP 3.',
  ],

  // 147/130 - SAKURA HARUNO (M) - "Original Team 7"
  '147/130': [
    '[⧗] If you don\'t have the Edge, CHAKRA +2.',
  ],

  // 148/130 - KAKASHI HATAKE (M) - "Original Team 7"
  '148/130': [
    'Gain the Edge.',
    'Copy an instant effect of another friendly Team 7 character in play.',
  ],

  // 149/130 - KIBA INUZUKA (M) - "Fang Over Fang"
  '149/130': [
    'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.',
    'MAIN effect: Instead, defeat both of them.',
  ],

  // 150/130 - SHIKAMARU NARA (M) - "Shadow Strangle Jutsu"
  '150/130': [
    '[⧗] The opponent cannot play characters while hidden in this mission.',
    'Hide an enemy character with Power 3 or less in this mission.',
  ],

  // 151/130 - ROCK LEE (M) - "Loopy Fist"
  '151/130': [
    '[⧗] At the end of the round, you must move this character to another mission, if able.',
    'Reveal and discard the top card of your deck: POWERUP X where X is the cost of the discarded card.',
  ],

  // 152/130 - ITACHI UCHIHA (M) - "Amaterasu"
  '152/130': [
    'Move a friendly character in play.',
    '[⧗] Every enemy character in this mission has -1 Power.',
  ],

  // 153/130 - GAARA (M) - "Sand Coffin"
  '153/130': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],

  // =====================
  // MISSION CARDS
  // =====================

  // MSS 01 - Call for Support
  'MSS 01': [
    '[↯] POWERUP 2 a character in play.',
  ],

  // MSS 03 - Find the Traitor
  'MSS 03': [
    '[↯] Opponent discards a card from hand.',
  ],

  // MSS 04 - Assassination
  'MSS 04': [
    '[↯] Defeat an enemy hidden character.',
  ],

  // MSS 05 - Bring it Back
  'MSS 05': [
    '[↯] You must return one friendly non-hidden character in this mission to your hand, if able.',
  ],

  // MSS 06 - Rescue a Friend
  'MSS 06': [
    '[↯] Draw a card.',
  ],

  // MSS 07 - I Have to Go
  'MSS 07': [
    '[↯] Move a friendly hidden character in play.',
  ],

  // MSS 08 - Set a Trap
  'MSS 08': [
    '[↯] Put a card from your hand as a hidden character on any mission.',
  ],
};
