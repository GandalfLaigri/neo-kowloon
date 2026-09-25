# Neo-Kowloon · Secteur 7

Simulateur de balade dans une ville cyberpunk en voxels (Three.js + TypeScript + Vite).

**Jouer en ligne : https://gandalflaigri.github.io/neo-kowloon/** (navigateur de bureau avec WebGL 2, clavier et souris ; cliquez sur « Entrer dans la ville »).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # version statique dans dist/
```

Ajoutez `?seed=mon-quartier` à l'URL (ou utilisez « Nouvelle ville » dans le menu) pour générer une autre ville.

## Commandes

| Touche | Action |
| --- | --- |
| ZQSD / WASD | marcher (Maj : courir) · Espace : sauter |
| E | appeler l'ascenseur / étage suivant dans la cabine · s'asseoir, acheter une canette, commander à manger |
| 1 – 9 | choisir l'étage dans la cabine |
| F | vol libre (Espace monter, C descendre, Maj turbo) |
| V | appeler la voiture volante, monter à bord, en descendre (à moins de 5 m du sol, à vitesse réduite) |
| En voiture | souris : regarder · ZQSD / WASD : avancer (dans la direction du regard), glisser · Espace / C : monter / descendre · Maj : turbo |
| M | carte cliquable : choisir une destination pour s'y téléporter (Échap pour fermer) |
| J | carnet d'exploration : quartiers, lieux, transports, expériences et secrets à découvrir |
| R | retour au point de départ · H : masquer l'aide · Échap : menu |

## Ce qu'on trouve dans la ville

- **Rue (glauque)** : chaussée mouillée, crasse et coulures au pied des murs, graffitis, bennes, sacs poubelle, cartons, scooters, lampadaires défaillants, rideaux de fer baissés dans les ruelles, linge qui sèche, bouches d'égout fumantes, campements sous le viaduc.
- **Sous-sols** (trémies jaunes sur la carte) : club, marché noir, parking désaffecté avec fût enflammé.
- **Métro aérien** : 2 lignes, 3 stations chacune, escaliers depuis la rue. Les rames font la navette : on monte quand les portes sont ouvertes.
- **Escaliers de secours** en zigzag sur les façades, de la rue ou d'une terrasse au niveau supérieur.
- **Passants** : sur les trottoirs, ruelles, passerelles et quais, certains avec parapluie à LED. Ils s'arrêtent si on leur barre la route.
- **En hauteur (luxe, au-delà de 140 m)** : garde-corps vitrés, platelage bois, arbres et bambous, salons de terrasse, toits aménagés (piscine, jardin suspendu, lounge), fenêtres plus chaudes.
- **Vie urbaine** : trafic au sol (voitures, taxis, camions, motos) qui respecte les feux tricolores et s'arrête devant vous, drones de livraison et de surveillance, voitures de police aux gyrophares, scènes d'intervention, navettes qui se posent sur des aires d'atterrissage.
- **Passants plus vivants** : assis sur les bancs, les tabourets et dans les rames, groupes qui discutent, fumeurs, chats errants aux yeux phosphorescents.
- **Spectacle** : hologrammes géants (carpes koï, visage de geisha, logos), dirigeable publicitaire qui remonte une avenue, projecteurs qui balaient les nuages, orage avec éclairs et tonnerre.
- **Étages visitables** : bureaux, appartements, penthouses et squats derrière de vraies baies vitrées, desservis par les ascenseurs.
- **Son** (Web Audio, 100 % synthétisé) : pluie étouffée sous les abris, vent en altitude, moteurs et sirènes positionnés, métro, ascenseur, club techno à travers les murs, nappe d'ambiance, tonnerre retardé selon la distance. Volume et musique réglables dans le menu.
- **Rendu** : occlusion ambiante en espace écran et ombres de contact, cônes de lumière volumétriques sous les lampadaires.
- **Lieux uniques** (catégorie verte sur la carte) : la Grande Bibliothèque (péristyle, salle de lecture, rayonnages, lampes vertes, lecteurs), le parc Kowloon mal famé (grillages crevés, arbres morts, terrain de basket en cage, fontaine asséchée, campement, dealers), le sanctuaire Inari (torii, lanternes de pierre, arbre sacré, encens), le chantier abandonné (squelette de tour, grue qui oscille au vent, squatteurs) et l'Arcologie Tenkai, une pyramide à gradins dorée dont les torchères crachent des flammes.
- **Architecture plus variée** : vieux immeubles de brique aux hautes fenêtres et corniches en périphérie, entrepôts en tôle ondulée et rideaux de fer, tours à mur-rideau vitré au centre, hôtels-capsules à hublots, balcons-cages avec linge et plantes, pagodes et dômes sur certains toits, panneaux publicitaires et châteaux d'eau.
- **Plus de vie** : vendeurs qui travaillent, chalands qui flânent dans les allées des marchés, passants qui s'arrêtent devant les vitrines ou marchent les yeux sur leur téléphone, piétons qui attendent au bord du trottoir et traversent au bonhomme vert (feux piétons synchronisés avec la circulation), danseurs dans les clubs, employés au clavier, clients qui boivent au bar, sans-abri endormis. Les personnages proches regardent autour d'eux et se tournent vers vous quand vous approchez.
- **Détails de rue** : voitures garées (taxis, fourgons, épaves, feux de détresse), abribus, cabines réseau, kiosques, armoires électriques, vélos, plaques de rue, caméras de surveillance, distributeurs de billets, affiches déchirées.
- **Voiture volante** : appelez-la (V), elle descend du ciel près de vous ; pilotage avec inertie, inclinaison dans les virages, collisions, caméra de poursuite, champ de vision qui s'élargit avec la vitesse, moteur et autoradio techno. Garée, elle apparaît sur la carte.
- **Pluie réglable** (menu) : aucune, légère ou battante (densité et longueur des gouttes, éclaboussures au sol, ondulations des flaques, brouillard, son).
- **Six quartiers** (nom affiché à l'entrée, zones colorées sur la carte), chacun avec son architecture, ses néons, sa propreté, sa foule et son ambiance sonore :
  - *Centre d'affaires* : mégatours, Arcologie Tenkai ;
  - *Quartier Ivoire* (riche) : tours de verre, avenues arborées, bornes lumineuses, jardins à fontaine, rues sans un tag ;
  - *Quartier de Jade* (asiatique) : enseignes serrées, guirlandes de lanternes au-dessus des rues, portes monumentales, charrettes de dim sum, air de cithare ;
  - *Les Bas-Fonds* : immeubles bas couverts de tags, cabanes de tôle accrochées aux façades, fûts enflammés, lampadaires morts, chiens errants ;
  - *Quartier des Plaisirs* : néons rose et violet, arches lumineuses, hôtels à cœur clignotant, files d'attente devant les clubs, foule dense ;
  - *Les Docks* : entrepôts, dépôts de conteneurs, projecteurs au sodium.
- **Port et canal** : un front de mer borde un côté de la ville. Quai avec bittes d'amarrage et escaliers de débarquement, portiques à conteneurs, porte-conteneurs à quai, canal des Lanternes traversant un îlot (passerelles en dos d'âne, sampans), palais flottant, village sur pilotis, yacht, vieux phare au bout d'une jetée, plateforme pétrolière et îles à l'horizon. L'eau reflète les néons (elle réutilise le miroir de la chaussée).
- **Métro souterrain** (ligne C, 4 stations) : entrées sur les trottoirs, mezzanine avec portillons et automates, escalators qui vous emportent, quais carrelés aux couleurs du quartier, correspondance avec la ligne B. Annonces vocales dans toutes les rames (synthèse vocale du navigateur).
- **Faune urbaine** : pigeons et corbeaux qui s'envolent à votre approche et vont se poser plus loin, rats qui détalent le long des murs, chiens errants qui vous fixent et aboient.
- **Événements** : course-poursuite de police dans le ciel, coupure de courant qui plonge un quartier dans le noir, spectacle de drones formant des figures au-dessus du quartier Ivoire, défilé du dragon avec tambours et pétards dans le Quartier de Jade.
- **Interactions** : s'asseoir sur un banc, au bar ou sur un quai (vue assise), acheter une canette aux distributeurs, commander à manger aux étals et aux kiosques.
- **Carnet d'exploration** (touche J) : 38 entrées à cocher, dont des secrets (un bar clandestin sans enseigne, une fresque visible seulement du ciel, une épave sur un toit, un autel caché, un jardin suspendu, les tags du Fantôme…). La progression est conservée dans le navigateur.

## Architecture

- `src/world/city.ts` : génération procédurale. Îlots et lots, tours à retraits (une terrasse ceinturée de néon à chaque retrait), strates « civiques » tous les 48 m qui alignent les passerelles, ascenseurs extérieurs vitrés, intérieurs (bar, arcade, cantine), enseignes, écrans, marchés de nuit, câbles, couloirs de trafic aérien et skyline lointaine.
- `src/world/builder.ts` : tout est une boîte alignée sur la grille de 0,5 m. Les boîtes sont fusionnées par chunks de 128 m, avec la collision et une carte d'abri pour la pluie.
- `src/render/materials.ts` : shader voxel unique. Les fenêtres, glyphes d'enseignes, écrans animés, dalles et flaques sont calculés voxel par voxel. Les 24 lumières ponctuelles les plus proches éclairent la scène.
- `src/render/ground.ts` : chaussée mouillée avec réflexion planaire (flou selon les flaques, ondulations de pluie).
- `src/world/metro.ts`, `stairs.ts`, `basements.ts`, `props.ts` : viaducs et stations, escaliers de secours, sous-sols, mobilier, végétation, luxe en hauteur, émetteurs de vapeur.
- `src/metro.ts` : rames (cinématique, portes, collisions mobiles, transport du joueur).
- `src/pedestrians.ts` : passants instanciés, animés dans le vertex shader.
- `src/render/steam.ts` : vapeur en particules animées sur le GPU.
- `src/render/beams.ts` : cônes de lumière additifs (lampadaires, projecteurs, drones, phares).
- `src/render/post.ts` : occlusion ambiante, bloom, étalonnage.
- `src/spectacle.ts` : hologrammes, dirigeable, projecteurs de toit, orage.
- `src/vehicles.ts` : trafic au sol, drones, police, navettes des aires d'atterrissage.
- `src/audio.ts` : moteur sonore procédural.
- `src/world/floors.ts`, `src/world/spectacle.ts` : étages aménagés, placement des éléments animés et des destinations.
- `src/world/landmarks.ts` : lieux uniques (bibliothèque, parc, sanctuaire, chantier, sommet de la pyramide).
- `src/world/street.ts`, `src/world/extras.ts` : mobilier et détails de rue, passages piétons, balcons, éléments de toit.
- `src/pilot.ts` : voiture volante (appel, pilotage, collisions, caméra de poursuite).
- `src/render/splash.ts` : éclaboussures de pluie.
- `src/world/districts.ts`, `src/world/quarters.ts` : répartition et identité des quartiers, décor propre à chacun, oiseaux, secrets.
- `src/world/coast.ts`, `src/render/water.ts` : front de mer, canal, port ; eau réfléchissante.
- `src/world/subway.ts` : ligne souterraine (tunnels, stations, escalators).
- `src/fauna.ts`, `src/events.ts`, `src/interact.ts`, `src/journal.ts` : oiseaux, événements, interactions, carnet d'exploration.
- `src/elevators.ts` : cabines animées, portes palières, plateformes mobiles pour la physique.
- `src/player.ts` : contrôleur à la première personne (collisions AABB, marches de 0,5 m, vol libre).
- `src/traffic.ts`, `src/render/rain.ts`, `src/render/sky.ts`, `src/render/post.ts` : trafic aérien, pluie, ciel et nuages, bloom et étalonnage.

En mode dev, `window.nk` expose des outils de debug (`nk.view(x, y, z, yaw, pitch, fly)`, `nk.step(secondes)`, `nk.key('v')`, `nk.hold('KeyW')`).
