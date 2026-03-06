// English translations of card effect descriptions
// Card ID -> array of effect descriptions in English (matching the order of effects in the JSON)
// Game-specific terms (POWERUP, CHAKRA, [⧗], [↯]) are kept as-is.

export const effectDescriptionsEn: Record<string, string[]> = {
  // =====================
  // COMMON (C)
  // =====================

  // 001/130 - HIRUZEN SARUTOBI (C) - "The Professor"
  'KS-001-C': [
    'POWERUP 2 another friendly Leaf Village character.',
  ],

  // 003/130 - TSUNADE (C) - "Master Medical Ninja"
  'KS-003-C': [
    '[⧗] When any friendly character is defeated, gain 2 Chakra.',
  ],

  // 005/130 - SHIZUNE (C) - "Tsunade\'s Assistant"
  'KS-005-C': [
    '[⧗] CHAKRA +1.',
  ],

  // 007/130 - JIRAIYA (C) - "Toad Sage"
  'KS-007-C': [
    'Play a Summon character anywhere, paying 1 less.',
  ],

  // 011/130 - SAKURA HARUNO (C) - "Team 7 Genin"
  'KS-011-C': [
    'If there\'s another Team 7 character in this mission, draw a card.',
  ],

  // 013/130 - SASUKE UCHIHA (C) - "Last of the Uchiha Clan"
  'KS-013-C': [
    '[⧗] This character has -1 Power for every other non-hidden friendly character in this mission.',
  ],

  // 015/130 - KAKASHI HATAKE (C) - "Team 7 Sensei"
  'KS-015-C': [
    '[⧗] Other Team 7 characters in this mission have +1 Power.',
  ],

  // 017/130 - CHOJI AKIMICHI (C) - "Expansion Jutsu"
  'KS-017-C': [
    'POWERUP 3.',
  ],

  // 019/130 - INO YAMANAKA (C) - "Team 10 Genin"
  'KS-019-C': [
    'If there\'s another Team 10 character in this mission, POWERUP 1.',
  ],

  // 021/130 - SHIKAMARU NARA (C) - "Team 10 Genin"
  'KS-021-C': [
    'If you have the Edge, draw a card.',
  ],

  // 023/130 - ASUMA SARUTOBI (C) - "Team 10 Sensei"
  'KS-023-C': [
    'Move another Team 10 character from this mission.',
  ],

  // 025/130 - KIBA INUZUKA (C) - "Team 8 Genin"
  'KS-025-C': [
    '[⧗] If [u]Akamaru[/u] is in the same mission, CHAKRA +1.',
  ],

  // 027/130 - AKAMARU (C) - "Ninja Dog"
  'KS-027-C': [
    '[⧗] If there isn\'t a [u]Kiba Inuzuka[/u] in this mission at the end of the round, you must return this character to your hand.',
  ],

  // 030/130 - HINATA HYUGA (C) - "Gentle Fist"
  'KS-030-C': [
    'Remove up to 2 Power tokens from an enemy character in play.',
  ],

  // 032/130 - SHINO ABURAME (C) - "Parasitic Insects"
  'KS-032-C': [
    'Each player draws a card.',
  ],

  // 034/130 - KURENAI YUHI (C) - "Team 8 Sensei"
  'KS-034-C': [
    '[⧗] Other Team 8 characters cost 1 less (min. 1) to play in this mission.',
  ],

  // 036/130 - NEJI HYUGA (C) - "Gentle Fist"
  'KS-036-C': [
    'Remove up to 2 Power tokens from an enemy character in play.',
  ],

  // 038/130 - ROCK LEE (C) - "Strong Fist Training"
  'KS-038-C': [
    'POWERUP 1.',
  ],

  // 040/130 - TENTEN (C) - "Team Guy Genin"
  'KS-040-C': [
    '[⧗] You can play this character only in a mission where you are currently winning.',
  ],

  // 042/130 - GAI MAITO (C) - "Team Guy Sensei"
  'KS-042-C': [
    '[⧗] Other Team Guy characters in this mission have +1 Power.',
  ],

  // 044/130 - ANKO MITARASHI (C) - "Chunin Exam Proctor"
  'KS-044-C': [
    '[⧗] If you have at least one other friendly Leaf Village character in this mission, CHAKRA +1.',
  ],

  // 046/130 - EBISU (C) - "Elite Trainer"
  'KS-046-C': [
    'If there is a friendly non-hidden character with less Power than this character in this mission, draw a card.',
  ],

  // 047/130 - IRUKA (C) - "Academy Instructor"
  'KS-047-C': [
    'Move a [u]Naruto Uzumaki[/u] character in play.',
  ],

  // 048/130 - HAYATE GEKKO (C) - "Talented Shinobi"
  'KS-048-C': [
    '[⧗] If this character would be defeated, hide it instead.',
  ],

  // 049/130 - GEMMA SHIRANUI (C) - "Elite Guard"
  'KS-049-C': [
    '[⧗] If a friendly Leaf Village character in this mission would be hidden or defeated by enemy effects, you can defeat this character instead.',
  ],

  // 050/130 - OROCHIMARU (C) - "Infiltrator"
  'KS-050-C': [
    'Look at a hidden enemy character in this mission. If it costs 3 or less, take control of that character and move it to your side.',
  ],

  // 052/130 - KABUTO YAKUSHI (C) - "The Mole"
  'KS-052-C': [
    'Draw the top card of the opponent\'s deck and put it hidden in any mission under your control.',
  ],

  // 055/130 - KIMIMARO (C) - "Dance of the Camellia"
  'KS-055-C': [
    'Discard a card to hide a character in play with cost 3 or less.',
  ],

  // 057/130 - JIROBO (C) - "Curse Mark Bearer"
  'KS-057-C': [
    'POWERUP X. X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 059/130 - KIDOMARU (C) - "Curse Mark Bearer"
  'KS-059-C': [
    'Move X friendly character(s). X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 061/130 - SAKON (C) - "Curse Mark Bearer"
  'KS-061-C': [
    'Draw X card(s). X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 064/130 - TAYUYA (C) - "Curse Mark Bearer"
  'KS-064-C': [
    '[⧗] CHAKRA +X. X is the number of missions where you have at least one friendly Sound Four character.',
  ],

  // 068/130 - DOSU KINUTA (C) - "Superhuman Hearing"
  'KS-068-C': [
    'Look at a hidden character in play.',
    'Defeat a hidden character in play.',
  ],

  // 070/130 - ZAKU ABUMI (C) - "Overconfident Shinobi"
  'KS-070-C': [
    'Opponent gains 1 Chakra.',
  ],

  // 072/130 - KIN TSUCHI (C) - "Kunoichi"
  'KS-072-C': [
    'Opponent draws a card.',
  ],

  // 074/130 - GAARA (C) - "Sand Village Genin"
  'KS-074-C': [
    'POWERUP X where X is the number of friendly hidden characters in this mission.',
  ],

  // 075/130 - GAARA (C) - "Sand Shield"
  'KS-075-C': [
    '[⧗] If this character would be moved or defeated by enemy effects, hide them instead.',
    '[⧗] You can play this character while hidden paying 2 less.',
  ],

  // 077/130 - KANKURO (C) - "Chakra Strings"
  'KS-077-C': [
    '[⧗] If there\'s at least one non-hidden enemy character in this mission, CHAKRA +1.',
  ],

  // 079/130 - TEMARI (C) - "Kunoichi"
  'KS-079-C': [
    '[⧗] If you have the Edge, this character has +2 Power.',
  ],

  // 081/130 - BAKI (C) - "Council Agent"
  'KS-081-C': [
    '[↯] Draw a card.',
  ],

  // 084/130 - YASHAMARU (C) - "Gaara\'s Caretaker"
  'KS-084-C': [
    '[⧗] This character has +2 Power if there\'s a friendly [u]Gaara[/u] in this mission.',
  ],

  // 088/130 - HAKU (C) - "Orphan of the Land of Water"
  'KS-088-C': [
    'Draw 1 card. If you do, you must put 1 card from your hand on top of your deck.',
  ],

  // 090/130 - ITACHI UCHIHA (C) - "Akatsuki"
  'KS-090-C': [
    '[⧗] If there is a [u]Sasuke Uchiha[/u] in this mission, you can play this character while hidden paying 3 less.',
  ],

  // 092/130 - KISAME HOSHIGAKI (C) - "Rogue Ninja of the Hidden Mist"
  'KS-092-C': [
    'Remove up to 2 Power tokens from an enemy character in this mission and put them on this character.',
  ],

  // 094/130 - GAMABUNTA (C) - "Chief Toad"
  'KS-094-C': [
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 095/130 - GAMAHIRO (C) - "Armed Toad"
  'KS-095-C': [
    'If there\'s a friendly character in this mission, draw a card.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 096/130 - GAMAKICHI (C) - "Gamabunta\'s Eldest Son"
  'KS-096-C': [
    '[⧗] Pay 1 less to play this character if there\'s a friendly [u]Naruto Uzumaki[/u] in this mission.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 097/130 - GAMATATSU (C) - "Gamabunta\'s Youngest Son"
  'KS-097-C': [
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 098/130 - KATSUYU (C) - "Giant Slug"
  'KS-098-C': [
    'If there is a friendly [u]Tsunade[/u] in play, POWERUP 2.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 099/130 - PAKKUN (C) - "Kakashi\'s Ninja Dog"
  'KS-099-C': [
    '[↯] Move this character to another mission.',
  ],

  // 100/130 - NINJA HOUNDS (C) - "Kakashi\'s Ninja Dogs"
  'KS-100-C': [
    '[⧗] When this character moves to a different mission, look at a hidden character in that mission.',
  ],

  // 101/130 - TON TON (C) - "Tsunade\'s Ninja Pig"
  'KS-101-C': [
    '[⧗] If there\'s a friendly [u]Tsunade[/u] or [u]Shizune[/u] in this mission, this character has +1 Power.',
  ],

  // =====================
  // UNCOMMON (UC)
  // =====================

  // 002/130 - HIRUZEN SARUTOBI (UC) - "Third Hokage"
  'KS-002-UC': [
    'Play a Leaf Village character anywhere paying 1 less.',
    'POWERUP 2 the character played with the MAIN effect.',
  ],

  // 004/130 - TSUNADE (UC) - "Creation Rebirth"
  'KS-004-UC': [
    '[⧗] Defeated friendly characters go into your hand instead of your discard pile.',
    'Choose one character in your discard pile and put them into your hand.',
  ],

  // 006/130 - SHIZUNE (UC) - "Poison Mist"
  'KS-006-UC': [
    'Move an enemy character in play with Power 3 or less.',
    'Gain 2 additional Chakra.',
  ],

  // 008/130 - JIRAIYA (UC) - "Summoning Jutsu"
  'KS-008-UC': [
    'Play a Summon character anywhere, paying 2 less.',
    'MAIN effect: In addition, hide an enemy character with cost 3 or less in this mission.',
  ],

  // 010/130 - NARUTO UZUMAKI (UC) - "Sexy Jutsu"
  'KS-010-C': [
    'Move this character to another mission.',
  ],

  // 012/130 - SAKURA HARUNO (UC) - "Inner Sakura"
  'KS-012-UC': [
    '[⧗] CHAKRA +1.',
    'Draw a card, then discard a card.',
  ],

  // 014/130 - SASUKE UCHIHA (UC) - "Sharingan"
  'KS-014-UC': [
    'Look at the opponent\'s hand.',
    'Additionally, discard 1 card. If you do, choose 1 card in the opponent\'s hand and discard it.',
  ],

  // 016/130 - KAKASHI HATAKE (UC) - "Copy Ninja"
  'KS-016-UC': [
    'Copy a non-upgrade instant effect of an enemy character with cost 4 or less in play.',
    'MAIN effect: Instead, there is no cost limit.',
  ],

  // 018/130 - CHOJI AKIMICHI (UC) - "Expansion Jutsu"
  'KS-018-UC': [
    '[⧗] When this character moves to another mission, hide an enemy character with less Power there.',
    'Move this character to another mission.',
  ],

  // 020/130 - INO YAMANAKA (UC) - "Mind Transfer Jutsu"
  'KS-020-UC': [
    'Take control of an enemy character with cost 2 or less in this mission.',
    'MAIN effect: Instead, the cost limit is 3.',
  ],

  // 022/130 - SHIKAMARU NARA (UC) - "Shadow Possession Jutsu"
  'KS-022-UC': [
    'Move an enemy character from the mission that was just revealed to this mission.',
  ],

  // 024/130 - ASUMA SARUTOBI (UC) - "Flying Swallow"
  'KS-024-UC': [
    'Draw a card, then discard a card. POWERUP 3 if you discarded a Team 10 character.',
  ],

  // 026/130 - KIBA INUZUKA (UC) - "Fang Over Fang"
  'KS-026-UC': [
    'Hide the lowest cost enemy character in this mission.',
    'Look at the top 3 cards of your deck, reveal and draw all [u]Akamaru[/u] characters, then put back the other cards.',
  ],

  // 028/130 - AKAMARU (UC) - "Man Beast Clone"
  'KS-028-UC': [
    'At the end of the turn, you may return this character to your hand.',
    'POWERUP 2 a friendly [u]Kiba Inuzuka[/u] in this mission.',
  ],

  // 029/130 - AKAMARU (UC) - "Dynamic Marking"
  'KS-029-UC': [
    '[⧗] You can play this character as an upgrade over [u]Kiba Inuzuka[/u].',
    'Hide the lowest cost enemy character in this mission.',
  ],

  // 031/130 - HINATA HYUGA (UC) - "Byakugan"
  'KS-031-UC': [
    '[⧗] When an enemy character is played in this mission, gain 1 Chakra.',
  ],

  // 033/130 - SHINO ABURAME (UC) - "Parasitic Insects"
  'KS-033-UC': [
    'Play this character paying 4 less if there is an enemy Jutsu character in this mission.',
    'Move this character.',
  ],

  // 035/130 - KURENAI YUHI (UC) - "Demonic Illusion"
  'KS-035-UC': [
    '[⧗] Characters can\'t be moved from this mission.',
    'Defeat an enemy character with Power 1 or less in this mission.',
  ],

  // 037/130 - NEJI HYUGA (UC) - "Eight Trigrams"
  'KS-037-UC': [
    '[⧗] When an enemy character is played in this mission, POWERUP 1.',
    'Remove up to 3 Power tokens from an enemy character in play.',
  ],

  // 039/130 - ROCK LEE (UC) - "Primary Lotus"
  'KS-039-UC': [
    '[⧗] This character doesn\'t lose its Power tokens at the end of the round.',
    'POWERUP 2.',
  ],

  // 041/130 - TENTEN (UC) - "Rising Twin Dragons"
  'KS-041-UC': [
    'Defeat a hidden character in this mission.',
    'POWERUP 1 another friendly Leaf Village character in this mission.',
  ],

  // 043/130 - GAI MAITO (UC) - "Dynamic Entry"
  'KS-043-UC': [
    '[⧗] This character doesn\'t lose its Power tokens at the end of the round.',
    'POWERUP 3.',
  ],

  // 045/130 - ANKO MITARASHI (UC) - "Hidden Shadow Snake Hands"
  'KS-045-UC': [
    'Defeat a hidden enemy character in play.',
  ],

  // 051/130 - OROCHIMARU (UC) - "Sannin"
  'KS-051-UC': [
    '[⧗] At the end of each Mission Phase, if you lost a mission where this character is assigned, move this character to the next unresolved mission.',
    'Defeat a hidden enemy character in this mission.',
  ],

  // 053/130 - KABUTO YAKUSHI (UC) - "Dead Soul Jutsu"
  'KS-053-UC': [
    'Discard a card.',
    'Play the top character of your discard pile anywhere, paying its cost minus 3.',
  ],

  // 054/130 - KABUTO YAKUSHI (UC) - "Chakra Scalpel"
  'KS-054-UC': [
    'POWERUP 1.',
    'Hide all other non-hidden characters with Power less than this character in this mission.',
  ],

  // 056/130 - KIMIMARO (UC) - "Bone Pulse"
  'KS-056-UC': [
    '[⧗] If this character is affected by an enemy effect, the opponent must pay 1 Chakra, if able.',
    'Discard a card to hide a character in play with cost 4 or less.',
  ],

  // 058/130 - JIROBO (UC) - "Earth Barrier"
  'KS-058-UC': [
    'POWERUP 1 each friendly Sound Four character in this mission.',
    'MAIN effect: Instead, POWERUP 1 each friendly Sound Four character in every mission.',
  ],

  // 060/130 - KIDOMARU (UC) - "Spider Web"
  'KS-060-UC': [
    'Move a character out of this mission.',
    'Defeat an enemy character with Power 1 or less in play.',
  ],

  // 062/130 - SAKON (UC) - "Parasite Demon"
  'KS-062-UC': [
    'Copy the instant effect of a friendly Sound Four character in play.',
  ],

  // 063/130 - UKON (UC) - "Parasite Demon"
  'KS-063-UC': [
    '[⧗] You can play this character as an upgrade over any Sound Village character.',
  ],

  // 065/130 - TAYUYA (UC) - "Demon Flute"
  'KS-065-UC': [
    'POWERUP 2 a friendly Sound Village character in play.',
    'Look at the top 3 cards of your deck, reveal and draw all Summon characters, then put back the others.',
  ],

  // 066/130 - DOKI (UC) - "Demon"
  'KS-066-UC': [
    'Steal 1 Chakra from the opponent if there is a friendly Sound Four character in this mission.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 067/130 - REMPART (UC) - "Barrier"
  'KS-067-UC': [
    '[⧗] The strongest non-hidden enemy character in this mission has Power 0.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 069/130 - DOSU KINUTA (UC) - "Melody Arm"
  'KS-069-UC': [
    'Look at a hidden character in play.',
    'Force an enemy hidden character in this mission to reveal itself or be defeated.',
  ],

  // 071/130 - ZAKU ABUMI (UC) - "Slicing Sound Wave"
  'KS-071-UC': [
    'If you have fewer characters in this mission than the opponent, move an enemy character from this mission.',
    'POWERUP 2.',
  ],

  // 073/130 - KIN TSUCHI (UC) - "Bell Needles"
  'KS-073-UC': [
    'Discard a card to hide an enemy character with Power 4 or less.',
    'UPGRADE: Place the top card of your deck as a hidden character in this mission.',
  ],

  // 076/130 - ICHIBI (UC) - "One-Tail"
  'KS-076-UC': [
    '[⧗] You can play this character as an upgrade over [u]Gaara[/u].',
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
  ],

  // 078/130 - KANKURO (UC) - "Puppet Master"
  'KS-078-UC': [
    'Move any character with Power 4 or less to another mission.',
    'Play a character while hidden in this mission, paying 1 less.',
  ],

  // 080/130 - TEMARI (UC) - "Wind Scythe Jutsu"
  'KS-080-UC': [
    'Move a friendly Sand Village character to another mission.',
    'Move this character to another mission.',
  ],

  // 082/130 - BAKI (UC) - "Blade of Wind"
  'KS-082-UC': [
    '[↯] Defeat a hidden enemy character in play.',
    'POWERUP 1 each friendly Sand Village character in this mission.',
  ],

  // 083/130 - RASA (UC) - "Fourth Kazekage"
  'KS-083-UC': [
    '[↯] Gain 1 additional Mission point if there is a friendly Sand Village character in this mission.',
  ],

  // 085/130 - YASHAMARU (UC) - "Gaara\'s Caretaker"
  'KS-085-UC': [
    '[↯] Defeat this character and another character in this mission.',
  ],

  // 087/130 - ZABUZA MOMOCHI (UC) - "Demon of the Mist"
  'KS-087-UC': [
    'If there is only one enemy character in this mission, hide it.',
    'MAIN effect: Instead, defeat it.',
  ],

  // 089/130 - HAKU (UC) - "Crystal Ice Mirrors"
  'KS-089-UC': [
    'Discard the top card of the opponent\'s deck. POWERUP X where X is the cost of the discarded card.',
    'MAIN effect: Instead, discard from your own deck.',
  ],

  // 091/130 - ITACHI UCHIHA (UC) - "Mangekyo Sharingan"
  'KS-091-UC': [
    'Look at a random card in the opponent\'s hand.',
    'MAIN effect: In addition, the opponent discards that card and draws a card.',
  ],

  // 093/130 - KISAME HOSHIGAKI (UC) - "Samehada"
  'KS-093-UC': [
    'Steal up to 2 Power tokens from an enemy character and put them on this character.',
    'MAIN effect: In addition, steal from any mission.',
  ],

  // 102/130 - MANDA (UC) - "King of Snakes"
  'KS-102-UC': [
    'AMBUSH [↯] Defeat an enemy Summon character in this mission.',
    '[⧗] At the end of the round, you must return this character to your hand.',
  ],

  // 103/130 - KYODAIGUMO (UC) - "Giant Spider"
  'KS-103-UC': [
    '[⧗] At the end of the round, hide a character with Power equal or less than this character. Then, you must return this character to your hand.',
  ],

  // =====================
  // RARE (R)
  // =====================

  // 104/130 - TSUNADE (R) - "Chakra Enhanced Strength"
  'KS-104-R': [
    'Spend any amount of additional Chakra. POWERUP X, where X is the amount of additional Chakra spent.',
    'POWERUP X.',
  ],
  // 104 - TSUNADE (MV) - "Legendary Sannin"
  'KS-104-MV': [
    'Spend any amount of additional Chakra. POWERUP X, where X is the amount of additional Chakra spent.',
    'POWERUP X.',
  ],

  // 105/130 - JIRAIYA (R) - "Earth Style: Mud Wall"
  'KS-105-R': [
    'Play a Summon character anywhere, paying 3 less.',
    'Move any enemy character from this mission.',
  ],

  // 106/130 - KAKASHI HATAKE (R) - "Curse Sealing"
  'KS-106-R': [
    'Discard the top card of an upgraded enemy character in play.',
    'MAIN effect: Copy any non-Upgrade instant effect from the discarded enemy character.',
  ],

  // 107/130 - SASUKE UCHIHA (R) - "Chidori"
  'KS-107-R': [
    'You must move all other non-hidden friendly characters from this mission, if able.',
    'POWERUP X where X is the number of characters moved this way.',
  ],

  // 108/130 - NARUTO UZUMAKI (R) - "Fury of the Rasengan"
  'KS-108-R': [
    'Hide an enemy character with Power 3 or less in this mission.',
    'MAIN effect: POWERUP X where X is the Power of the enemy character that is being hidden.',
  ],
  'KS-108-RA': [
    'Hide an enemy character with Power 3 or less in this mission.',
    'MAIN effect: POWERUP X where X is the Power of the enemy character that is being hidden.',
  ],

  // 109/130 - SAKURA HARUNO (R) - "Medical Ninja"
  'KS-109-R': [
    'Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.',
    'MAIN effect: Instead, play the card paying 2 less.',
  ],

  // 110/130 - INO YAMANAKA (R) - "Mind Destruction"
  'KS-110-R': [
    'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.',
    'MAIN effect: After moving, hide the enemy character.',
  ],
  'KS-110-RA': [
    'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character from this mission.',
    'MAIN effect: After moving, hide the enemy character.',
  ],

  // 111/130 - SHIKAMARU NARA (R) - "Shadow Strangle Jutsu"
  'KS-111-R': [
    '[⧗] The opponent cannot play characters while hidden in this mission.',
    'Hide an enemy character with Power 3 or less in this mission.',
  ],

  // 112/130 - CHOJI AKIMICHI (R) - "Butterfly Bombing"
  'KS-112-R': [
    'Discard a card from your hand. POWERUP X where X is the cost of the discarded card.',
    'Repeat the MAIN effect.',
  ],

  // 113/130 - KIBA INUZUKA (R) - "Fang Over Fang"
  'KS-113-R': [
    'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.',
    'MAIN effect: Instead, defeat both of them.',
  ],

  // 113b/130 - ASUMA SARUTOBI (R) - "Flying Swallow"
  'KS-113b-R': [
    'Draw a card.',
    'Discard a card to defeat a character with Power X or less in play, where X is the Power of the discarded card.',
  ],

  // 114/130 - HINATA HYUGA (R) - "Protective Eight Trigrams Sixty-Four Palms"
  'KS-114-R': [
    'POWERUP 2. POWERUP 1 another character.',
    'Remove all Power tokens from an enemy character in play.',
  ],
  'KS-114-RA': [
    'POWERUP 2. POWERUP 1 another character.',
    'Remove all Power tokens from an enemy character in play.',
  ],

  // 116/130 - NEJI HYUGA (R) - "Eight Trigrams Sixty-Four Palms"
  'KS-116-R': [
    'Defeat a character in this mission with exactly Power 4.',
    'Defeat a character with exactly Power 6 in this mission.',
  ],
  'KS-116-RA': [
    'Defeat a character in this mission with exactly Power 4.',
    'Defeat a character with exactly Power 6 in this mission.',
  ],

  // 116b/130 - KURENAI YUHI (R) - "Flower Petal Escape"
  'KS-116b-R': [
    'Defeat an enemy character with Power 4 or less in this mission.',
    'Move this character to another mission.',
  ],

  // 117/130 - ROCK LEE (R) - "Loopy Fist"
  'KS-117-R': [
    '[⧗] At the end of the round, you must move this character to another mission, if able.',
    'Reveal and discard the top card of your deck: POWERUP X where X is the cost of the discarded card.',
  ],

  // 118/130 - TENTEN (R) - "Rising Twin Dragons"
  'KS-118-R': [
    'Defeat a hidden character in this mission. If the defeated character had a printed Power of 3 or less, defeat a hidden character in play.',
  ],
  'KS-118-RA': [
    'Defeat a hidden character in this mission. If the defeated character had a printed Power of 3 or less, defeat a hidden character in play.',
  ],

  // 119/130 - KANKURO (R) - "Secret Black Move: Iron Maiden"
  'KS-119-R': [
    'Move any character in play.',
    'Defeat an enemy character with Power 3 or less in this mission.',
  ],

  // 119b/130 - MIGHT GUY (R) - "Gate of Opening"
  'KS-119b-R': [
    'POWERUP 3.',
    'Discard a card. If you do so, move any number of non-hidden enemy characters in play with total Power of the Power of this character or less.',
  ],

  // 120/130 - GAARA (R) - "Sand Coffin"
  'KS-120-R': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],
  'KS-120-RA': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],

  // 121/130 - TEMARI (R) - "Wind Scythe Jutsu"
  'KS-121-R': [
    'Move any friendly character in play.',
    'Move any character in play.',
  ],

  // 122/130 - JIROBO (R) - "Arhat Fist"
  'KS-122-R': [
    'POWERUP X where X is the number of characters in this mission.',
    'Defeat an enemy character with Power 1 or less in this mission.',
  ],

  // 123/130 - KIMIMARO (R) - "Earth Curse Mark"
  'KS-123-R': [
    '[⧗] At the end of the round, you must defeat this character if you have no cards in hand.',
    'Discard a card to defeat a character in play with cost 5 or less.',
  ],

  // 124/130 - KIDOMARU (R) - "Spider Bow: Fierce Rip"
  'KS-124-R': [
    'Defeat an enemy character with Power 3 or less in another mission.',
    'AMBUSH effect: Instead, the Power limit is 5 or less.',
  ],

  // 124b/130 - UKON (R) - "Multiple Fists Barrage"
  'KS-124b-R': [
    '[⧗] You can play this character as an upgrade over any Sound Village character.',
    'Hide an enemy character in this mission with Power 5 or less.',
  ],

  // 125/130 - TAYUYA (R) - "Demon Flute: Chains of Fantasia"
  'KS-125-R': [
    '[⧗] Non-hidden enemy characters cost an additional 1 Chakra to play in this mission.',
    'Play a Sound Village character, paying 2 less.',
  ],

  // 126/130 - OROCHIMARU (R) - "Sword of Kusanagi"
  'KS-126-R': [
    'Defeat the weakest non-hidden enemy character in play.',
    'POWERUP 3.',
  ],

  // 128/130 - ITACHI UCHIHA (R) - "I control them all."
  'KS-128-R': [
    '[⧗] Every enemy character in this mission has -1 Power.',
    'Move a friendly character to this mission.',
  ],

  // 129/130 - KYUBI (R) - "Demon Fox Cloak"
  'KS-129-R': [
    '[⧗] You can play this character as an upgrade over [u]Naruto Uzumaki[/u].',
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
  ],

  // 130/130 - ICHIBI (R) - "Gaara Playing Possum Jutsu"
  'KS-130-R': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Choose a mission and defeat all hidden enemy characters assigned to it.',
  ],
  'KS-130-RA': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Choose a mission and defeat all hidden enemy characters assigned to it.',
  ],

  // =====================
  // SECRET (S)
  // =====================

  // 131/130 - TSUNADE (S) - "Fifth Hokage"
  'KS-131-S': [
    'POWERUP 1 every friendly Leaf Village character in play.',
  ],

  // 132/130 - JIRAIYA (S) - "Inside the Toad"
  'KS-132-S': [
    'Play a Summon character anywhere, paying 5 less.',
    'The opponent must choose characters to be defeated until they only have up to 2 assigned in each mission.',
  ],

  // 133/130 - NARUTO UZUMAKI (S) - "Rasengan"
  'KS-133-S': [
    'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.',
    'effect: Instead, defeat both of them.',
  ],

  // 134/130 - KYUBI (S) - "Destruction"
  'KS-134-S': [
    '[⧗] Can\'t be hidden or defeated by enemy effects.',
    'Hide any number of non-hidden characters in play with total Power of 6 or less.',
  ],

  // 135/130 - SAKURA HARUNO (S) - "Leaf Village Medical Corps"
  'KS-135-S': [
    'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.',
    'effect: Instead, play the card paying 4 less.',
  ],

  // 136/130 - SASUKE UCHIHA (S) - "Heaven Curse Mark"
  'KS-136-S': [
    '[⧗] When a character is defeated, gain 1 Chakra.',
    'You must choose a friendly non-hidden character and any enemy character in this mission and defeat them, if able.',
  ],

  // 135/130 - SAKURA HARUNO (MV) - "He's looking... right at me!"
  'KS-135-MV': [
    'Look at the top 3 cards of your deck. Play one character anywhere and discard the other cards.',
    'effect: Instead, play the card paying 4 less.',
  ],

  // 136/130 - SASUKE UCHIHA (MV) - "You're annoying."
  'KS-136-MV': [
    '[⧗] When a character is defeated, gain 1 Chakra.',
    'You must choose a friendly non-hidden character and any enemy character in this mission and defeat them, if able.',
  ],

  // 137/130 - KAKASHI HATAKE (S) - "Lightning Blade"
  'KS-137-S': [
    'Move this character to another mission.',
    'Hide an upgraded character in this mission.',
  ],

  // 138/130 - OROCHIMARU (S) - "Summoning: Impure World Reincarnation"
  'KS-138-S': [
    '[⧗] You can play this character as an upgrade to any character that is not a Summon nor Orochimaru.',
    'Gain 2 Mission points if the character you upgraded from had Power 6 or more.',
  ],

  // 139/130 - GAARA (S) - "Desert Coffin"
  'KS-139-S': [
    'Defeat an enemy character with a cost less than the number of friendly hidden characters in play.',
    'MAIN effect: In addition, hide one other enemy character with same name and cost less than the defeated character.',
  ],

  // 140/130 - ITACHI UCHIHA (S) - "Tsukuyomi"
  'KS-140-S': [
    'The opponent discards their entire hand, then draws the same number of cards discarded this way.',
    'Defeat a character in play with cost X or less, where X is the number of cards discarded by the MAIN effect.',
  ],

  // =====================
  // MYTHOS (M)
  // =====================

  // 141/130 - NARUTO UZUMAKI (M) - "Defying Sasuke"
  'KS-141-M': [
    'Discard a card. If you do, hide an enemy character with Power 4 or less in this mission.',
  ],

  // 142/130 - SASUKE UCHIHA (M) - "Defying Naruto"
  'KS-142-M': [
    'Discard a card. If you do, POWERUP X+1 where X is the number of enemy characters in this mission.',
  ],

  // 143/130 - ITACHI UCHIHA (M) - "Hunting Naruto"
  'KS-143-M': [
    'Move a friendly character to this mission.',
    'Move an enemy character to this mission.',
  ],

  // 144/130 - KISAME HOSHIGAKI (M) - "Chakra Absorption"
  'KS-144-M': [
    'Steal 1 Chakra from the opponent\'s pool.',
  ],

  // 145/130 - NARUTO UZUMAKI (M) - "Original Team 7"
  'KS-145-M': [
    '[⧗] If you have the Edge, your hidden characters in this mission have +1 Power.',
  ],

  // 146/130 - SASUKE UCHIHA (M) - "Original Team 7"
  'KS-146-M': [
    'Give the Edge to the opponent. If you do so, POWERUP 3.',
  ],

  // 147/130 - SAKURA HARUNO (M) - "Original Team 7"
  'KS-147-M': [
    '[⧗] If you don\'t have the Edge, CHAKRA +2.',
  ],

  // 148/130 - KAKASHI HATAKE (M) - "Original Team 7"
  'KS-148-M': [
    'Gain the Edge.',
    'Copy a non-upgrade instant effect of another friendly Team 7 character in play.',
  ],

  // 113/130 V - KIBA INUZUKA (MV) - "Fang Over Fang"
  'KS-113-MV': [
    'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.',
    'MAIN effect: Instead, defeat both of them.',
  ],

  // 111/130 V - SHIKAMARU NARA (MV) - "Shadow Strangle Jutsu"
  'KS-111-MV': [
    '[⧗] The opponent cannot play characters while hidden in this mission.',
    'Hide an enemy character with Power 3 or less in this mission.',
  ],

  // 117/130 V - ROCK LEE (MV) - "Loopy Fist"
  'KS-117-MV': [
    '[⧗] At the end of the round, you must move this character to another mission, if able.',
    'Reveal and discard the top card of your deck: POWERUP X where X is the cost of the discarded card.',
  ],

  // 128/130 V - ITACHI UCHIHA (MV) - "Amaterasu"
  'KS-128-MV': [
    'Move a friendly character in play.',
    '[⧗] Every enemy character in this mission has -1 Power.',
  ],

  // 120/130 V - GAARA (MV) - "Sand Coffin"
  'KS-120-MV': [
    'Defeat up to 1 enemy character with Power 1 or less in every mission.',
    'POWERUP X, where X is the number of characters defeated by the MAIN effect.',
  ],

  // =====================
  // LEGENDARY (L)
  // =====================

  // 000/130 - NARUTO UZUMAKI (L) - "Legendary"
  'KS-000-L': [
    'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.',
    'MAIN effect: Instead, defeat both of them.',
  ],

  // =====================
  // MOVIE VARIANT (MV)
  // =====================

  // 108/130 - NARUTO UZUMAKI (MV) - "I won't run away!"
  'KS-108-MV': [
    'Hide an enemy character with Power 3 or less in this mission.',
    'MAIN effect: POWERUP X where X is the Power of the enemy character that is being hidden.',
  ],

  // =====================
  // RARE ART (RA) — cards without R equivalent entries
  // =====================

  'KS-104-RA': [
    'Spend any amount of additional Chakra. POWERUP X, where X is the amount of additional Chakra spent.',
    'POWERUP X.',
  ],
  'KS-105-RA': [
    'Play a Summon character anywhere, paying 3 less.',
    'Move any enemy character from this mission.',
  ],
  'KS-106-RA': [
    'Discard the top card of an upgraded enemy character in play.',
    'MAIN effect: Copy any non-Upgrade instant effect from the discarded enemy character.',
  ],
  'KS-107-RA': [
    'You must move all other non-hidden friendly characters from this mission, if able.',
    'POWERUP X where X is the number of characters moved this way.',
  ],
  'KS-109-RA': [
    'Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.',
    'MAIN effect: Instead, play the card paying 2 less.',
  ],
  'KS-111-RA': [
    '[⧗] The opponent cannot play characters while hidden in this mission.',
    'Hide an enemy character with Power 3 or less in this mission.',
  ],
  'KS-112-RA': [
    'Discard a card from your hand. POWERUP X where X is the cost of the discarded card.',
    'Repeat the MAIN effect.',
  ],
  'KS-113-RA': [
    'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.',
    'MAIN effect: Instead, defeat both of them.',
  ],
  'KS-117-RA': [
    '[⧗] At the end of the round, you must move this character to another mission, if able.',
    'Reveal and discard the top card of your deck: POWERUP X where X is the cost of the discarded card.',
  ],
  'KS-119-RA': [
    'Move any character in play.',
    'Defeat an enemy character with Power 3 or less in this mission.',
  ],
  'KS-121-RA': [
    'Move any friendly character in play.',
    'Move any character in play.',
  ],
  'KS-123-RA': [
    '[⧗] At the end of the round, you must defeat this character if you have no cards in hand.',
    'Discard a card to defeat a character in play with cost 5 or less.',
  ],
  'KS-125-RA': [
    '[⧗] Non-hidden enemy characters cost an additional 1 Chakra to play in this mission.',
    'Play a Sound Village character, paying 2 less.',
  ],
  'KS-126-RA': [
    'Defeat the weakest non-hidden enemy character in play.',
    'POWERUP 3.',
  ],
  'KS-128-RA': [
    '[⧗] Every enemy character in this mission has -1 Power.',
    'Move a friendly character to this mission.',
  ],

  // =====================
  // MISSION CARDS
  // =====================

  // MSS 01 - Call for Support
  'KS-001-MMS': [
    '[↯] POWERUP 2 a character in play.',
  ],

  // MSS 03 - Find the Traitor
  'KS-003-MMS': [
    '[↯] Opponent discards a card from hand.',
  ],

  // MSS 04 - Assassination
  'KS-004-MMS': [
    '[↯] Defeat an enemy hidden character.',
  ],

  // MSS 05 - Bring it Back
  'KS-005-MMS': [
    '[↯] You must return one friendly non-hidden character in this mission to your hand, if able.',
  ],

  // MSS 06 - Rescue a Friend
  'KS-006-MMS': [
    '[↯] Draw a card.',
  ],

  // MSS 07 - I Have to Go
  'KS-007-MMS': [
    '[↯] Move a friendly hidden character in play.',
  ],

  // MSS 08 - Set a Trap
  'KS-008-MMS': [
    '[↯] Put a card from your hand as a hidden character on any mission.',
  ],

  // MSS 02 - Chunin Exam
  'KS-002-MMS': [
    '[⧗] All non-hidden characters in this mission have +1 Power.',
  ],

  // MSS 09 - Protect the Leader
  'KS-009-MMS': [
    '[⧗] Characters with 4 Power or more in this mission have +1 Power.',
  ],

  // MSS 10 - Chakra Training
  'KS-010-MMS': [
    '[⧗] CHAKRA +1 for both players.',
  ],

  // 115 - Shino Aburame (R/RA)
  'KS-115-R': [
    '[⧗] Friendly characters in this mission cannot be hidden by enemy effects.',
    'AMBUSH: Move a friendly character in this mission to another mission.',
  ],
  'KS-115-RA': [
    '[⧗] Friendly characters in this mission cannot be hidden by enemy effects.',
    'AMBUSH: Move a friendly character in this mission to another mission.',
  ],

  // 127 - Sakon (R/RA)
  'KS-127-R': [
    '[⧗] Each enemy character in this mission has -1 Power.',
    'UPGRADE: Move a friendly character in play to another mission.',
  ],
  'KS-127-RA': [
    '[⧗] Each enemy character in this mission has -1 Power.',
    'UPGRADE: Move a friendly character in play to another mission.',
  ],

  // =====================
  // SECRET V (SV) — Gold variants of Secret cards
  // =====================

  'KS-131-SV': [
    'POWERUP 1 every friendly Leaf Village character in play.',
  ],
  'KS-133-SV': [
    'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.',
    'effect: Instead, defeat both of them.',
  ],
  'KS-133-MV': [
    'Hide an enemy character with Power 5 or less in this mission and another enemy character with Power 2 or less in play.',
    'MAIN effect: Instead, defeat both of them.',
  ],
  'KS-136-SV': [
    '[⧗] When a character is defeated, gain 1 Chakra.',
    'You must choose a friendly non-hidden character and any enemy character in this mission and defeat them, if able.',
  ],
  'KS-137-SV': [
    'Move this character to another mission.',
    'Hide an upgraded character in this mission.',
  ],
};
