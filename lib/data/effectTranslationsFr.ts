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

  // 108/130 - NARUTO UZUMAKI (RA) - "Believe it!"
  '108/130': [
    'Placez la carte du dessus de votre deck en tant que personnage cache dans cette mission.',
    'Repetez l\'effet MAIN.',
  ],

  // 108/130 A - NARUTO UZUMAKI (RA) - same as 108/130
  '108/130 A': [
    'Placez la carte du dessus de votre deck en tant que personnage cache dans cette mission.',
    'Repetez l\'effet MAIN.',
  ],

  // 109/130 - SAKURA HARUNO (R) - "Ninja Medical"
  '109/130': [
    'Choisissez un de vos personnages Village de Konoha dans votre defausse et jouez-le n\'importe ou en payant son cout.',
    'effet MAIN : A la place, jouez la carte en payant 2 de moins.',
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
  // Corrected: MAIN targets upgraded characters (friend or foe), not just enemies
  '137/130': [
    'Deplacez ce personnage.',
    'Cachez un personnage ameliore dans cette mission.',
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
  // UNCOMMON (UC) - Previously missing
  // =====================

  // 002/130 - HIRUZEN SARUTOBI (UC) - "Troisieme Hokage"
  '002/130': [
    'Jouez un personnage Village de Konoha n\'importe ou en payant 1 de moins.',
    'POWERUP 2 sur le personnage joue avec l\'effet MAIN.',
  ],

  // 004/130 - TSUNADE (UC) - "La Creation et le Renouveau"
  '004/130': [
    '[⧗] Les personnages allies vaincus vont dans votre main au lieu de votre defausse.',
    'Choisissez un personnage dans votre defausse et placez-le dans votre main.',
  ],

  // 005/130 - SHIZUNE (C) - "Assistante de Tsunade"
  '005/130': [
    '[⧗] CHAKRA +1.',
  ],

  // 006/130 - SHIZUNE (UC) - "Brouillard Empoisonne"
  '006/130': [
    'Deplacez un personnage ennemi avec une Puissance de 3 ou moins depuis cette mission.',
    'Gagnez 2 Chakra supplementaires.',
  ],

  // 008/130 - JIRAYA (UC) - "Jutsu d\'Invocation"
  '008/130': [
    'Jouez un personnage Invocation n\'importe ou en payant 2 de moins.',
    'effet MAIN : En plus, cachez un personnage ennemi avec un cout de 3 ou moins dans cette mission.',
  ],

  // 010/130 - NARUTO UZUMAKI (UC) - "Sexy Meta"
  '010/130': [
    'Deplacez ce personnage.',
  ],

  // 012/130 - SAKURA HARUNO (UC) - "Sakura Interieure"
  '012/130': [
    '[⧗] CHAKRA +1.',
    'Piochez une carte, puis defaussez une carte.',
  ],

  // 014/130 - SASUKE UCHIWA (UC) - "Sharingan"
  '014/130': [
    'Regardez une carte aleatoire dans la main de l\'adversaire.',
    'Defaussez la carte regardee et l\'adversaire pioche une carte.',
  ],

  // 016/130 - KAKASHI HATAKE (UC) - "Ninja Copieur"
  '016/130': [
    'Copiez l\'effet instantane d\'un personnage ennemi avec un cout de 4 ou moins dans cette mission.',
    'effet MAIN : A la place, il n\'y a pas de limite de cout.',
  ],

  // 017/130 - CHOJI AKIMICHI (C) - "Decuplement"
  '017/130': [
    'POWERUP 3.',
  ],

  // 018/130 - CHOJI AKIMICHI (UC) - "Jutsu de Decuplement"
  '018/130': [
    '[⧗] Quand ce personnage est deplace, cachez-le.',
    'Deplacez ce personnage.',
  ],

  // 020/130 - INO YAMANAKA (UC) - "Transfert de l\'Esprit"
  '020/130': [
    'Prenez le controle d\'un personnage ennemi avec un cout de 2 ou moins dans cette mission.',
    'effet MAIN : A la place, la limite de cout est de 3.',
  ],

  // 022/130 - SHIKAMARU NARA (UC) - "Possession des Ombres"
  '022/130': [
    'Deplacez un personnage ennemi de la mission qui vient d\'etre revelee vers cette mission.',
  ],

  // 024/130 - ASUMA SARUTOBI (UC) - "Lames Volantes"
  '024/130': [
    'Piochez une carte, puis defaussez une carte. POWERUP 3 si vous avez defausse un personnage Equipe 10.',
  ],

  // 026/130 - KIBA INUZUKA (UC) - "Crocs Lacerateurs"
  '026/130': [
    'Cachez le personnage ennemi avec le plus faible cout dans cette mission.',
    'effet MAIN : En plus, cherchez [u]Akamaru[/u] dans votre deck et jouez-le dans cette mission gratuitement.',
  ],

  // 028/130 - AKAMARU (UC) - "Clone Homme-Bete"
  '028/130': [
    '[⧗] S\'il n\'y a pas de [u]Kiba Inuzuka[/u] dans cette mission a la fin du tour, renvoyez ce personnage en main.',
    'POWERUP 2 sur un [u]Kiba Inuzuka[/u] allie dans cette mission.',
  ],

  // 029/130 - AKAMARU (UC) - "Marquage Dynamique"
  '029/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus [u]Kiba Inuzuka[/u].',
    'Cachez le personnage ennemi avec le plus faible cout dans cette mission.',
  ],

  // 030/130 - HINATA HYUGA (C) - "Poing Souple"
  '030/130': [
    'Retirez jusqu\'a 2 jetons de Puissance d\'un personnage ennemi en jeu.',
  ],

  // 031/130 - HINATA HYUGA (UC) - "Byakugan"
  '031/130': [
    '[⧗] Quand un personnage ennemi est joue dans cette mission, gagnez 1 Chakra.',
  ],

  // 032/130 - SHINO ABURAME (C) - "Insectes Destructeurs"
  '032/130': [
    'Chaque joueur pioche une carte.',
  ],

  // 033/130 - SHINO ABURAME (UC) - "Insectes Parasites"
  '033/130': [
    'Tous les personnages joues par l\'adversaire coutent 1 de plus ce tour.',
    'Deplacez ce personnage.',
  ],

  // 035/130 - KURENAI YUHI (UC) - "Illusion Demoniaque"
  '035/130': [
    '[⧗] Les personnages ne peuvent pas etre deplaces depuis cette mission.',
    'Vainquez un personnage ennemi avec une Puissance de 1 ou moins dans cette mission.',
  ],

  // 037/130 - NEJI HYUGA (UC) - "Huit Trigrammes"
  '037/130': [
    '[⧗] Quand un personnage ennemi est joue dans cette mission, POWERUP 1.',
    'Retirez jusqu\'a 3 jetons de Puissance d\'un personnage ennemi en jeu.',
  ],

  // 038/130 - ROCK LEE (C) - "Entrainement au Poing violent"
  '038/130': [
    'POWERUP 1.',
  ],

  // 041/130 - TENTEN (UC) - "Dragons Jumeaux"
  '041/130': [
    'Vainquez un personnage cache dans cette mission.',
    'POWERUP 1 sur un autre personnage Village de Konoha allie dans cette mission.',
  ],

  // 043/130 - GAI MAITO (UC) - "Entree Dynamique"
  '043/130': [
    '[⧗] Ce personnage ne perd pas ses jetons de Puissance a la fin du tour.',
    'POWERUP 3.',
  ],

  // 045/130 - ANKO MITARASHI (UC) - "Mains des Serpents de l\'Ombre"
  '045/130': [
    'Vainquez un personnage ennemi cache en jeu.',
  ],

  // 051/130 - OROCHIMARU (UC) - "Sannin"
  '051/130': [
    '[⧗] A la fin de chaque Phase de Mission, si vous avez perdu une mission ou ce personnage est assigne, deplacez ce personnage vers la prochaine mission non resolue.',
    'Vainquez un personnage ennemi cache dans cette mission.',
  ],

  // 052/130 - KABUTO YAKUSHI (C) - "La Taupe"
  '052/130': [
    'Piochez la carte du dessus du deck de l\'adversaire et placez-la en cache dans n\'importe quelle mission sous votre controle.',
  ],

  // 053/130 - KABUTO YAKUSHI (UC) - "Jutsu des Ames Mortes"
  '053/130': [
    'Piochez une carte.',
    'Jouez un personnage depuis votre defausse n\'importe ou en payant son cout moins 3.',
  ],

  // 054/130 - KABUTO YAKUSHI (UC) - "Scalpel de Chakra"
  '054/130': [
    'POWERUP 1.',
    'Cachez tous les personnages ennemis non caches avec une Puissance inferieure a celle de ce personnage dans cette mission.',
  ],

  // 056/130 - KIMIMARO (UC) - "Pulsion Osseuse"
  '056/130': [
    '[⧗] Les personnages ennemis coutent 1 de plus a jouer dans cette mission.',
    'Defaussez une carte pour cacher un personnage en jeu avec un cout de 5 ou moins.',
  ],

  // 058/130 - JIROBO (UC) - "Barriere de Terre"
  '058/130': [
    'POWERUP 1 sur chaque personnage Quartet du Son allie en jeu.',
    'effet MAIN : A la place, POWERUP 1 sur chaque personnage Quartet du Son allie dans toutes les missions.',
  ],

  // 060/130 - KIDOMARU (UC) - "Toile d\'Araignee"
  '060/130': [
    'Deplacez un personnage allie depuis cette mission.',
    'Vainquez un personnage ennemi avec une Puissance de 1 ou moins dans cette mission.',
  ],

  // 062/130 - SAKON (UC) - "Demon Parasite"
  '062/130': [
    'Copiez l\'effet instantane d\'un personnage Quartet du Son allie en jeu.',
  ],

  // 063/130 - UKON (UC) - "Demon Parasite"
  '063/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus n\'importe quel personnage Village du Son.',
  ],

  // 065/130 - TAYUYA (UC) - "Flute Demoniaque"
  '065/130': [
    'POWERUP 2 sur un personnage du Son allie en jeu.',
    'Cherchez un personnage Invocation dans votre deck et jouez-le dans cette mission gratuitement.',
  ],

  // 066/130 - DOKI (UC) - "Demon"
  '066/130': [
    'Volez 1 Chakra a l\'adversaire s\'il y a un personnage Quartet du Son allie en jeu.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 067/130 - REMPART (UC) - "Barriere"
  '067/130': [
    '[⧗] Le personnage ennemi non cache le plus fort dans cette mission a une Puissance de 0.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 069/130 - DOSU KINUTA (UC) - "Bras Melodieux"
  '069/130': [
    'Regardez un personnage cache en jeu.',
    'Forcez un personnage ennemi cache dans cette mission a se reveler ou a etre vaincu.',
  ],

  // 071/130 - ZAKU ABUMI (UC) - "Onde Sonore Tranchante"
  '071/130': [
    'Si vous avez moins de personnages dans cette mission que l\'adversaire, deplacez un personnage ennemi depuis cette mission.',
    'POWERUP 2.',
  ],

  // 073/130 - KIN TSUCHI (UC) - "Aiguilles aux Grelots"
  '073/130': [
    'Defaussez une carte pour cacher un personnage ennemi avec une Puissance de 4 ou moins dans cette mission.',
    'effet MAIN : A la place, placez la carte du dessus de votre deck en tant que personnage cache dans cette mission.',
  ],

  // 076/130 - ICHIBI (UC) - "Queue Unique"
  '076/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus [u]Gaara[/u].',
    '[⧗] Ne peut pas etre cache ou vaincu par des effets ennemis.',
  ],

  // 078/130 - KANKURO (UC) - "Maitre des Marionnettes"
  '078/130': [
    'Deplacez un personnage ennemi avec une Puissance de 4 ou moins vers cette mission.',
    'Jouez un personnage en cache dans cette mission en payant 1 de moins.',
  ],

  // 080/130 - TEMARI (UC) - "Lame de Vent"
  '080/130': [
    'Deplacez un personnage Village du Sable allie en jeu.',
    'Deplacez ce personnage.',
  ],

  // 082/130 - BAKI (UC) - "Lame de Vent"
  '082/130': [
    '[↯] Vainquez un personnage ennemi cache en jeu.',
    'POWERUP 1 sur chaque personnage Village du Sable allie dans cette mission.',
  ],

  // 083/130 - RASA (UC) - "Quatrieme Kazekage"
  '083/130': [
    '[↯] Gagnez 1 point de mission supplementaire s\'il y a un personnage Village du Sable allie dans cette mission.',
  ],

  // 085/130 - YASHAMARU (UC) - "Tuteur de Gaara"
  '085/130': [
    '[↯] Vainquez ce personnage et un autre personnage dans cette mission.',
  ],

  // 087/130 - ZABUZA MOMOCHI (UC) - "Demon du Brouillard"
  '087/130': [
    'S\'il n\'y a qu\'un seul personnage ennemi dans cette mission, cachez-le.',
    'effet MAIN : A la place, vainquez-le.',
  ],

  // 089/130 - HAKU (UC) - "Miroirs de Glace"
  '089/130': [
    'Defaussez les X cartes du dessus du deck de l\'adversaire, ou X est le nombre de personnages allies dans cette mission. POWERUP X.',
    'effet MAIN : A la place, defaussez depuis votre propre deck.',
  ],

  // 091/130 - ITACHI UCHIWA (UC) - "Mangekyo Sharingan"
  '091/130': [
    'Regardez une carte aleatoire dans la main de l\'adversaire.',
    'effet MAIN : En plus, l\'adversaire defausse cette carte et pioche une carte.',
  ],

  // 093/130 - KISAME HOSHIGAKI (UC) - "Samehada"
  '093/130': [
    'Volez jusqu\'a 2 jetons de Puissance d\'un personnage ennemi et placez-les sur ce personnage.',
    'effet MAIN : En plus, volez depuis n\'importe quelle mission.',
  ],

  // 102/130 - MANDA (UC) - "Roi des Serpents"
  '102/130': [
    'Vainquez un personnage Invocation en jeu.',
    '[⧗] A la fin du tour, vous devez renvoyer ce personnage en main.',
  ],

  // 103/130 - KYODAIGUMO (UC) - "Araignee Geante"
  '103/130': [
    '[⧗] A la fin du tour, cachez ce personnage et renvoyez-le en main.',
  ],

  // =====================
  // RARE (R) - Previously missing
  // =====================

  // 104/130 - TSUNADE (R) - "Force Surhumaine"
  '104/130': [
    'Depensez n\'importe quelle quantite de Chakra supplementaire. POWERUP X, ou X est la quantite de Chakra supplementaire depensee.',
    'POWERUP X.',
  ],

  // 105/130 - JIRAYA (R) - "Doton : Mur de Boue"
  '105/130': [
    'Jouez un personnage Invocation n\'importe ou en payant 3 de moins.',
    'Deplacez n\'importe quel personnage ennemi depuis cette mission.',
  ],

  // 106/130 - KAKASHI HATAKE (R) - "Seau Maudit"
  '106/130': [
    'Defaussez la carte du dessus d\'un personnage ennemi ameliore en jeu.',
    'effet MAIN : Copiez n\'importe quel effet instantane non-Amelioration du personnage ennemi defausse.',
  ],

  // 107/130 - SASUKE UCHIWA (R) - "Chidori"
  '107/130': [
    'Vous devez deplacer tous les autres personnages allies non caches depuis cette mission, si possible.',
    'POWERUP X ou X est le nombre de personnages deplaces de cette facon.',
  ],

  // 108/130 note: already has FR translation

  // 109/130 note: already has FR translation

  // 110/130 - INO YAMANAKA (R) - "Destruction de l'Esprit"
  '110/130': [
    'S\'il y a 2 personnages ennemis ou plus dans cette mission, deplacez le personnage ennemi non cache le plus faible depuis cette mission.',
    'effet MAIN : Apres l\'avoir deplace, cachez le personnage ennemi.',
  ],
  '110/130 A': [
    'S\'il y a 2 personnages ennemis ou plus dans cette mission, deplacez le personnage ennemi non cache le plus faible depuis cette mission.',
    'effet MAIN : Apres l\'avoir deplace, cachez le personnage ennemi.',
  ],

  // 111/130 - SHIKAMARU NARA (R) - "Etranglement des Ombres"
  '111/130': [
    '[⧗] L\'adversaire ne peut pas jouer de personnages en cache dans cette mission.',
    'Cachez un personnage ennemi avec une Puissance de 3 ou moins dans cette mission.',
  ],

  // 112/130 - CHOJI AKIMICHI (R) - "Bombardement Papillon"
  '112/130': [
    'Defaussez une carte de votre main. POWERUP X ou X est le cout de la carte defaussee.',
    'Repetez l\'effet MAIN.',
  ],

  // 113/130 - KIBA INUZUKA (R) - "Crocs Lacerateurs"
  '113/130': [
    'Cachez un personnage [u]Akamaru[/u] allie. Si vous le faites, cachez un autre personnage dans cette mission.',
    'effet MAIN : A la place, vainquez-les tous les deux.',
  ],

  // 113b/130 - ASUMA SARUTOBI (R) - "Lames Volantes"
  '113b/130': [
    'Piochez une carte.',
    'Defaussez une carte pour vaincre un personnage avec une Puissance de X ou moins en jeu, ou X est la Puissance de la carte defaussee.',
  ],

  // 114/130 - HINATA HYUGA (R) - "Paumes des Huit Trigrammes Soixante-Quatre"
  '114/130': [
    'POWERUP 2. POWERUP 1 sur un autre personnage.',
    'Retirez tous les jetons de Puissance d\'un personnage ennemi en jeu.',
  ],
  '114/130 A': [
    'POWERUP 2. POWERUP 1 sur un autre personnage.',
    'Retirez tous les jetons de Puissance d\'un personnage ennemi en jeu.',
  ],

  // 116/130 - NEJI HYUGA (R) - "Paumes des Huit Trigrammes Soixante-Quatre"
  '116/130': [
    'Vainquez un personnage dans cette mission avec exactement 4 de Puissance.',
    'Vainquez un personnage dans cette mission avec exactement 6 de Puissance.',
  ],
  '116/130 A': [
    'Vainquez un personnage dans cette mission avec exactement 4 de Puissance.',
    'Vainquez un personnage dans cette mission avec exactement 6 de Puissance.',
  ],

  // 116b/130 - KURENAI YUHI (R) - "Evasion de Petales"
  '116b/130': [
    'Vainquez un personnage ennemi avec une Puissance de 4 ou moins dans cette mission.',
    'Deplacez ce personnage.',
  ],

  // 117/130 - ROCK LEE (R) - "Poing Loufoque"
  '117/130': [
    '[⧗] A la fin du tour, vous devez deplacer ce personnage vers une autre mission, si possible.',
    'Revelez et defaussez la carte du dessus de votre deck : POWERUP X ou X est le cout de la carte defaussee.',
  ],

  // 118/130 - TENTEN (R) - "Dragons Jumeaux Ascendants"
  '118/130': [
    'Vainquez un personnage cache dans cette mission. Si le personnage vaincu avait une Puissance imprimee de 3 ou moins, vainquez un personnage cache en jeu.',
  ],
  '118/130 A': [
    'Vainquez un personnage cache dans cette mission. Si le personnage vaincu avait une Puissance imprimee de 3 ou moins, vainquez un personnage cache en jeu.',
  ],

  // 119/130 - KANKURO (R) - "Technique Secrete Noire : Vierge de Fer"
  '119/130': [
    'Deplacez n\'importe quel personnage en jeu.',
    'Vainquez un personnage ennemi avec une Puissance de 3 ou moins dans cette mission.',
  ],

  // 119b/130 - MIGHT GUY (R) - "Porte de l\'Ouverture"
  '119b/130': [
    'POWERUP 3.',
    'Defaussez une carte. Si vous le faites, deplacez n\'importe quel nombre de personnages ennemis non caches en jeu dont la Puissance totale est egale ou inferieure a la Puissance de ce personnage.',
  ],

  // 121/130 - TEMARI (R) - "Lame de Vent"
  '121/130': [
    'Deplacez n\'importe quel personnage allie en jeu.',
    'Deplacez n\'importe quel personnage en jeu.',
  ],

  // 122/130 - JIROBO (R) - "Poing d\'Arhat"
  '122/130': [
    'POWERUP X ou X est le nombre de personnages dans cette mission.',
    'Vainquez un personnage ennemi avec une Puissance de 1 ou moins dans cette mission.',
  ],

  // 123/130 - KIMIMARO (R) - "Marque Maudite Terrestre"
  '123/130': [
    '[⧗] A la fin du tour, vous devez vaincre ce personnage si vous n\'avez plus de cartes en main.',
    'Defaussez une carte pour vaincre un personnage en jeu avec un cout de 5 ou moins.',
  ],

  // 124/130 - KIDOMARU (R) - "Arc d\'Araignee : Dechirure Feroce"
  '124/130': [
    'Vainquez un personnage ennemi avec une Puissance de 3 ou moins dans une autre mission.',
    'effet EMBUSCADE : A la place, la limite de Puissance est de 5 ou moins.',
  ],

  // 124b/130 - UKON (R) - "Barrage de Poings Multiples"
  '124b/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus n\'importe quel personnage Village du Son.',
    'Cachez un personnage ennemi dans cette mission avec une Puissance de 5 ou moins.',
  ],

  // 125/130 - TAYUYA (R) - "Flute Demoniaque : Chaines de Fantaisie"
  '125/130': [
    '[⧗] Les personnages ennemis non caches coutent 1 Chakra supplementaire a jouer dans cette mission.',
    'Jouez un personnage Village du Son en payant 2 de moins.',
  ],

  // 126/130 - OROCHIMARU (R) - "Epee de Kusanagi"
  '126/130': [
    'Vainquez le personnage ennemi non cache le plus faible en jeu.',
    'POWERUP 3.',
  ],

  // 128/130 - ITACHI UCHIWA (R) - "Amaterasu"
  '128/130': [
    'Deplacez un personnage allie en jeu.',
    '[⧗] Chaque personnage ennemi dans cette mission a -1 Puissance.',
  ],

  // 129/130 - KYUBI (R) - "Manteau du Demon Renard"
  '129/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus [u]Naruto Uzumaki[/u].',
    '[⧗] Ne peut pas etre cache ou vaincu par des effets ennemis.',
  ],

  // 130/130 - ICHIBI (R) - "Jutsu de la Fausse Mort de Gaara"
  '130/130': [
    '[⧗] Ne peut pas etre cache ou vaincu par des effets ennemis.',
    'Choisissez une mission et vainquez tous les personnages ennemis caches qui y sont assignes.',
  ],
  '130/130 A': [
    '[⧗] Ne peut pas etre cache ou vaincu par des effets ennemis.',
    'Choisissez une mission et vainquez tous les personnages ennemis caches qui y sont assignes.',
  ],

  // =====================
  // SECRET (S) - Previously missing
  // =====================

  // 131/130 - TSUNADE (S) - "Cinquieme Hokage"
  '131/130': [
    'POWERUP 1 sur chaque personnage Village de Konoha allie en jeu.',
  ],

  // 132/130 - JIRAYA (S) - "Dans l\'Estomac du Crapaud"
  '132/130': [
    'Jouez un personnage Invocation n\'importe ou en payant 5 de moins.',
    'L\'adversaire doit choisir des personnages a vaincre jusqu\'a ce qu\'il n\'en ait plus que 2 par mission au maximum.',
  ],

  // 134/130 - KYUBI (S) - "Destruction"
  '134/130': [
    '[⧗] Ne peut pas etre cache ou vaincu par des effets ennemis.',
    'Cachez n\'importe quel nombre de personnages non caches en jeu dont la Puissance totale est de 6 ou moins.',
  ],

  // 138/130 - OROCHIMARU (S) - "Invocation, Reincarnation des Ames"
  '138/130': [
    '[⧗] Vous pouvez jouer ce personnage en amelioration par-dessus n\'importe quel personnage qui n\'est ni une Invocation ni Orochimaru.',
    'Gagnez 2 points de mission si le personnage que vous avez ameliore avait une Puissance de 6 ou plus.',
  ],

  // 139/130 - GAARA (S) - "Le Tombeau du Desert"
  '139/130': [
    'Vainquez un personnage ennemi avec un cout inferieur au nombre de personnages allies caches en jeu.',
    'effet MAIN : En plus, cachez un autre personnage ennemi du meme nom avec un cout inferieur au personnage vaincu.',
  ],

  // 140/130 - ITACHI UCHIWA (S) - "Tsukuyomi"
  '140/130': [
    'L\'adversaire defausse toute sa main, puis pioche le meme nombre de cartes defaussees.',
    'Vainquez un personnage en jeu avec un cout de X ou moins, ou X est le nombre de cartes defaussees par l\'effet MAIN.',
  ],

  // =====================
  // MYTHOS (M) - Previously missing
  // =====================

  // 141/130 - NARUTO UZUMAKI (M) - "Defiant Sasuke"
  '141/130': [
    'Defaussez une carte. Si vous le faites, cachez un personnage ennemi avec une Puissance de 4 ou moins dans cette mission.',
  ],

  // 142/130 - SASUKE UCHIWA (M) - "Defiant Naruto"
  '142/130': [
    'Defaussez une carte. Si vous le faites, POWERUP X+1 ou X est le nombre de personnages ennemis dans cette mission.',
  ],

  // 145/130 - NARUTO UZUMAKI (M) - "Equipe 7 Originelle"
  '145/130': [
    '[⧗] Si vous avez l\'Initiative, vos personnages caches dans cette mission ont +1 Puissance.',
  ],

  // 146/130 - SASUKE UCHIWA (M) - "Equipe 7 Originelle"
  '146/130': [
    'Donnez l\'Initiative a l\'adversaire. Si vous le faites, POWERUP 3.',
  ],

  // 147/130 - SAKURA HARUNO (M) - "Equipe 7 Originelle"
  '147/130': [
    '[⧗] Si vous n\'avez pas l\'Initiative, CHAKRA +2.',
  ],

  // 148/130 - KAKASHI HATAKE (M) - "Equipe 7 Originelle"
  '148/130': [
    'Gagnez l\'Initiative.',
    'Copiez un effet instantane d\'un autre personnage Equipe 7 allie en jeu.',
  ],

  // 149/130 - KIBA INUZUKA (M) - "Crocs Lacerateurs"
  '149/130': [
    'Cachez un personnage [u]Akamaru[/u] allie. Si vous le faites, cachez un autre personnage dans cette mission.',
    'effet MAIN : A la place, vainquez-les tous les deux.',
  ],

  // 150/130 - SHIKAMARU NARA (M) - "Etranglement des Ombres"
  '150/130': [
    '[⧗] L\'adversaire ne peut pas jouer de personnages en cache dans cette mission.',
    'Cachez un personnage ennemi avec une Puissance de 3 ou moins dans cette mission.',
  ],

  // 151/130 - ROCK LEE (M) - "Poing Loufoque"
  '151/130': [
    '[⧗] A la fin du tour, vous devez deplacer ce personnage vers une autre mission, si possible.',
    'Revelez et defaussez la carte du dessus de votre deck : POWERUP X ou X est le cout de la carte defaussee.',
  ],

  // 152/130 - ITACHI UCHIHA (M) - "Amaterasu"
  '152/130': [
    'Deplacez un personnage allie en jeu.',
    '[⧗] Chaque personnage ennemi dans cette mission a -1 Puissance.',
  ],

  // 153/130 - GAARA (M) - "Cercueil de Sable"
  '153/130': [
    'Vainquez jusqu\'a 1 personnage ennemi avec une Puissance de 1 ou moins dans chaque mission.',
    'POWERUP X, ou X est le nombre de personnages vaincus par l\'effet MAIN.',
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
