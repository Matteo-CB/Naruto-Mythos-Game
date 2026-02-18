// French translations of card effect descriptions
// Card ID -> array of effect descriptions in French (matching the order of effects in the JSON)
// Game-specific terms (POWERUP, CHAKRA, [⧗], [↯]) are kept as-is.

export const effectDescriptionsFr: Record<string, string[]> = {
  // =====================
  // CHARACTER CARDS
  // =====================

  // 001/130 - HIRUZEN SARUTOBI (C) - "Le Professeur"
  '001/130': [
    'POWERUP 2 sur un autre personnage Village de Konoha allie.',
  ],

  // 003/130 - TSUNADE (C) - "Maitre Ninja Medical"
  '003/130': [
    '[⧗] Quand un personnage allie est vaincu, gagnez 2 Chakra.',
  ],

  // 007/130 - JIRAYA (C) - "Ermite des Crapauds"
  '007/130': [
    'Jouez un personnage Invocation n\'importe ou en payant 1 de moins.',
  ],

  // 011/130 - SAKURA HARUNO (C) - "Genin de l'Equipe 7"
  '011/130': [
    'S\'il y a un autre personnage Equipe 7 dans cette mission, piochez une carte.',
  ],

  // 013/130 - SASUKE UCHIWA (C) - "Dernier du Clan Uchiwa"
  '013/130': [
    '[⧗] Ce personnage a -1 Puissance pour chaque autre personnage allie non cache dans cette mission.',
  ],

  // 015/130 - KAKASHI HATAKE (C) - "Sensei de l'Equipe 7"
  '015/130': [
    '[⧗] Les autres personnages Equipe 7 dans cette mission ont +1 Puissance.',
  ],

  // 019/130 - INO YAMANAKA (C) - "Genin de l'Equipe 10"
  '019/130': [
    'S\'il y a un autre personnage Equipe 10 dans cette mission, POWERUP 1.',
  ],

  // 021/130 - SHIKAMARU NARA (C) - "Genin de l'Equipe 10"
  '021/130': [
    'Si vous avez l\'Initiative, piochez une carte.',
  ],

  // 023/130 - ASUMA SARUTOBI (C) - "Sensei de l'Equipe 10"
  '023/130': [
    'Deplacez un autre personnage Equipe 10 depuis cette mission.',
  ],

  // 025/130 - KIBA INUZUKA (C) - "Genin de l'Equipe 8"
  '025/130': [
    '[⧗] Si [u]Akamaru[/u] est dans la meme mission, CHAKRA +1.',
  ],

  // 027/130 - AKAMARU (C) - "Chien Ninja"
  '027/130': [
    '[⧗] S\'il n\'y a pas de [u]Kiba Inuzuka[/u] dans cette mission a la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 034/130 - YUHI KURENAI (C) - "Sensei de l'Equipe 8"
  '034/130': [
    '[⧗] Les autres personnages Equipe 8 coutent 1 de moins (min. 1) a jouer dans cette mission.',
  ],

  // 036/130 - NEJI HYUGA (C) - "Poing Souple"
  '036/130': [
    'Retirez jusqu\'a 2 jetons de Puissance d\'un personnage ennemi en jeu.',
  ],

  // 039/130 - ROCK LEE (UC) - "La Fleur du Lotus Recto"
  '039/130': [
    '[⧗] Ce personnage ne perd pas ses jetons de Puissance a la fin du tour.',
    'POWERUP 2.',
  ],

  // 040/130 - TENTEN (C) - "Genin de l'Equipe Gai"
  '040/130': [
    '[⧗] Vous ne pouvez jouer ce personnage que dans une mission ou vous etes actuellement en tete.',
  ],

  // 042/130 - GAI MAITO (C) - "Sensei de l'Equipe Gai"
  '042/130': [
    '[⧗] Les autres personnages Equipe Gai dans cette mission ont +1 Puissance.',
  ],

  // 044/130 - ANKO MITARASHI (C) - "Surveillant des examens Chunin"
  '044/130': [
    '[⧗] Si vous avez au moins un autre personnage Village de Konoha allie dans cette mission, CHAKRA +1.',
  ],

  // 046/130 - EBISU (C) - "Entraineur d'Elite"
  '046/130': [
    'S\'il y a un personnage allie non cache avec moins de Puissance que ce personnage dans cette mission, piochez une carte.',
  ],

  // 047/130 - IRUKA (C) - "Instructeur de l'Academie"
  '047/130': [
    'Deplacez un personnage [u]Naruto Uzumaki[/u] en jeu.',
  ],

  // 048/130 - HAYATE GEKKO (C) - "Shinobi talentueux"
  '048/130': [
    '[⧗] Si ce personnage devait etre vaincu, cachez-le a la place.',
  ],

  // 049/130 - GEMMA SHIRANUI (C) - "Garde d'Elite"
  '049/130': [
    '[⧗] Si un personnage Village de Konoha allie dans cette mission devait etre cache ou vaincu par des effets ennemis, vous pouvez vaincre ce personnage a la place.',
  ],

  // 050/130 - OROCHIMARU (C) - "Infiltre"
  '050/130': [
    'Regardez un personnage ennemi cache dans cette mission. S\'il coute 3 ou moins, prenez le controle de ce personnage et deplacez-le de votre cote.',
  ],

  // 055/130 - KIMIMARO (C) - "La Danse du Camelia"
  '055/130': [
    'Defaussez une carte pour cacher un personnage en jeu avec un cout de 3 ou moins.',
  ],

  // 057/130 - JIROBO (C) - "Porteur de la Marque Maudite"
  '057/130': [
    'POWERUP X. X est le nombre de missions ou vous avez au moins un personnage Quartet du Son allie.',
  ],

  // 059/130 - KIDOMARU (C) - "Porteur de la Marque Maudite"
  '059/130': [
    'Deplacez X personnage(s) allie(s). X est le nombre de missions ou vous avez au moins un personnage Quartet du Son allie.',
  ],

  // 061/130 - SAKON (C) - "Porteur de la Marque Maudite"
  '061/130': [
    'Piochez X carte(s). X est le nombre de missions ou vous avez au moins un personnage Quartet du Son allie.',
  ],

  // 064/130 - TAYUYA (C) - "Porteur de la Marque Maudite"
  '064/130': [
    '[⧗] CHAKRA +X. X est le nombre de missions ou vous avez au moins un personnage Quartet du Son allie.',
  ],

  // 068/130 - DOSU KINUTA (C) - "Ouie Surhumaine"
  '068/130': [
    'Regardez un personnage cache en jeu.',
    'Vainquez un personnage cache en jeu.',
  ],

  // 070/130 - ZAKU ABUMI (C) - "Shinobi trop confiant"
  '070/130': [
    'L\'adversaire gagne 1 Chakra.',
  ],

  // 072/130 - KIN TSUCHI (C) - "Kunoichi"
  '072/130': [
    'L\'adversaire pioche une carte.',
  ],

  // 074/130 - GAARA (C) - "Genin du Village du Sable"
  '074/130': [
    'POWERUP X ou X est le nombre de personnages allies caches dans cette mission.',
  ],

  // 075/130 - GAARA (C) - "Bouclier de Sable"
  '075/130': [
    '[⧗] Si ce personnage devait etre deplace ou vaincu par des effets ennemis, cachez-le a la place.',
    '[⧗] Vous pouvez jouer ce personnage en cache en payant 2 de moins.',
  ],

  // 077/130 - KANKURO (C) - "Fils de Chakra"
  '077/130': [
    '[⧗] S\'il y a au moins un personnage ennemi non cache dans cette mission, CHAKRA +1.',
  ],

  // 079/130 - TEMARI (C) - "Kunoichi"
  '079/130': [
    '[⧗] Si vous avez l\'Initiative, ce personnage a +2 Puissance.',
  ],

  // 081/130 - BAKI (C) - "Agent du Conseil"
  '081/130': [
    '[↯] Piochez une carte.',
  ],

  // 084/130 - YASHAMARU (C) - "Tuteur de Gaara"
  '084/130': [
    '[⧗] Ce personnage a +2 Puissance s\'il y a un [u]Gaara[/u] allie dans cette mission.',
  ],

  // 088/130 - HAKU (C) - "Orphelin du Pays de l'Eau"
  '088/130': [
    'Piochez 1 carte. Si vous le faites, vous devez placer 1 carte de votre main au-dessus de votre deck.',
  ],

  // 090/130 - ITACHI UCHIWA (C) - "Akatsuki"
  '090/130': [
    '[⧗] S\'il y a un [u]Sasuke Uchiha[/u] dans cette mission, vous pouvez jouer ce personnage en cache en payant 3 de moins.',
  ],

  // 092/130 - KISAME HOSHIGAKI (C) - "Le Ninja Deserteur du Village du Brouillard"
  '092/130': [
    'Retirez jusqu\'a 2 jetons de Puissance d\'un personnage ennemi dans cette mission et placez-les sur ce personnage.',
  ],

  // 094/130 - GAMA BUNTA (C) - "Chef des Crapauds"
  '094/130': [
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 095/130 - GAMAHIRO (C) - "Crapaud Arme"
  '095/130': [
    'S\'il y a un personnage allie dans cette mission, piochez une carte.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 096/130 - GAMAKITCHI (C) - "Fils aine de Gama Bunta"
  '096/130': [
    '[⧗] Payez 1 de moins pour jouer ce personnage s\'il y a un [u]Naruto Uzumaki[/u] allie dans cette mission.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 097/130 - GAMATATSU (C) - "Fils cadet de Gama Bunta"
  '097/130': [
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 098/130 - KATSUYU (C) - "Limace Geante"
  '098/130': [
    'S\'il y a une [u]Tsunade[/u] alliee en jeu, POWERUP 2.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 099/130 - PAKKUN (C) - "Chien Ninja de Kakashi"
  '099/130': [
    '[↯] Deplacez ce personnage.',
  ],

  // 100/130 - CHIENS NINJAS (C) - "Chiens Ninjas de Kakashi"
  '100/130': [
    '[⧗] Quand ce personnage est deplace vers une autre mission, regardez un personnage cache dans cette mission.',
  ],

  // 101/130 - TON TON (C) - "Cochon Ninja de Tsunade"
  '101/130': [
    '[⧗] S\'il y a une [u]Tsunade[/u] ou une [u]Shizune[/u] alliee dans cette mission, ce personnage a +1 Puissance.',
  ],

  // 108/130 - NARUTO UZUMAKI (R) - titre non renseigne
  '108/130': [
    'Cachez un personnage ennemi avec une Puissance de 3 ou moins dans cette mission.',
    'effet : POWERUP X ou X est la Puissance du personnage ennemi qui est cache.',
  ],

  // 108/130 A - NARUTO UZUMAKI (RA) - same as 108/130
  '108/130 A': [
    'Cachez un personnage ennemi avec une Puissance de 3 ou moins dans cette mission.',
    'effet : POWERUP X ou X est la Puissance du personnage ennemi qui est cache.',
  ],

  // 120/130 - GAARA (R) - titre non renseigne
  // Corrected to match cardLoader EFFECT_CORRECTIONS (2 effects, not 3)
  '120/130': [
    'Vainquez jusqu\'a 1 personnage ennemi avec une Puissance de 1 ou moins dans chaque mission.',
    'POWERUP X, ou X est le nombre de personnages vaincus par l\'effet MAIN.',
  ],

  // 120/130 A - GAARA (RA) - same as 120/130
  '120/130 A': [
    'Vainquez jusqu\'a 1 personnage ennemi avec une Puissance de 1 ou moins dans chaque mission.',
    'POWERUP X, ou X est le nombre de personnages vaincus par l\'effet MAIN.',
  ],

  // 133/130 - NARUTO UZUMAKI (S) - "Rasengan"
  '133/130': [
    'Cachez un personnage ennemi avec une Puissance de 5 ou moins dans cette mission et un autre personnage ennemi avec une Puissance de 2 ou moins en jeu.',
    'effet : A la place, vainquez-les tous les deux.',
  ],

  // 135/130 - SAKURA HARUNO (S) - "Corps Medical du Village de la Feuille"
  '135/130': [
    'Regardez les 3 cartes du dessus de votre deck. Jouez un personnage n\'importe ou et defaussez les autres cartes.',
    'effet : A la place, jouez la carte en payant 4 de moins.',
  ],

  // 136/130 - SASUKE UCHIWA (S) - "Marque maudite du Ciel"
  '136/130': [
    '[⧗] Quand un personnage est vaincu, gagnez 1 Chakra.',
    'Vous devez choisir un personnage allie non cache et un personnage ennemi dans cette mission et les vaincre, si possible.',
  ],

  // 137/130 - KAKASHI HATAKE (S) - "L'Eclair Pourfendeur"
  // Corrected to match cardLoader EFFECT_CORRECTIONS (2 effects, not 3)
  '137/130': [
    'Deplacez ce personnage.',
    'Cachez un personnage ennemi dans cette mission.',
  ],

  // 143/130 - ITACHI UCHIWA (M) - "Traquant Naruto"
  '143/130': [
    'Deplacez un personnage allie vers cette mission.',
    'Deplacez un personnage ennemi vers cette mission.',
  ],

  // 144/130 - KISAME HOSHIGAKI (M) - "Absorption du chakra"
  '144/130': [
    'Volez 1 Chakra de la reserve de l\'adversaire.',
  ],

  // =====================
  // MISSION CARDS
  // =====================

  // MSS 01 - Appel de soutien / Call for Support
  'MSS 01': [
    '[↯] POWERUP 2 sur un personnage en jeu.',
  ],

  // MSS 03 - Trouver le traitre / Find the Traitor
  'MSS 03': [
    '[↯] L\'adversaire defausse une carte de sa main.',
  ],

  // MSS 04 - Assassinat / Assassination
  'MSS 04': [
    '[↯] Vainquez un personnage ennemi cache.',
  ],

  // MSS 05 - Ramener / Bring it Back
  'MSS 05': [
    '[↯] Vous devez renvoyer en main un personnage allie non cache dans cette mission, si possible.',
  ],

  // MSS 06 - Sauvetage d'un ami / Rescue a Friend
  'MSS 06': [
    '[↯] Piochez une carte.',
  ],

  // MSS 07 - Je dois partir / I Have to Go
  'MSS 07': [
    '[↯] Deplacez un personnage allie cache en jeu.',
  ],

  // MSS 08 - Tendre un piege / Set a Trap
  'MSS 08': [
    '[↯] Placez une carte de votre main en tant que personnage cache sur n\'importe quelle mission.',
  ],
};
