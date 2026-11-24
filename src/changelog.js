// Release notes, newest first. At each release: bump "version" in package.json
// (major.minor.patch: patch = fixes, minor = new features, major = big changes) and add an entry here.
export const VERSION = __APP_VERSION__;
export const BUILD = __APP_BUILD__;
export const BUILT_AT = __APP_BUILT_AT__;

export const CHANGELOG = [
  {
    version: '1.14.1', date: '2026-11-24', title: 'Coach course plus juste',
    items: [
      'Course : le coach ne dit plus « la montre confirme, tu tiens les allures » quand tes fractions étaient trop rapides. Le conseil de ralentir reste affiché.',
    ],
  },
  {
    version: '1.14.0', date: '2026-11-24', title: 'Montre, course et coach plus malins',
    items: [
      'Fin du repos : une seule vibration. Quand la montre suit la séance, l\'iPhone n\'envoie plus sa notification en double.',
      'Montre : boutons − et + à côté de la charge et des reps, menu « … » pour ajouter une série, remplacer l\'exercice (machine prise) ou passer à un autre.',
      'Montre : séance finie sur la montre enregistrée tout de suite, même iPhone verrouillé (si la connexion est encore valide).',
      'Apple Santé : la séance de muscu porte la marque Kadence, le nom de la séance et le volume soulevé.',
      'Course : les courses d\'Apple Santé et de Strava se rattachent toutes seules à la séance prévue du jour.',
      'Course : bilan contre le plan, fraction par fraction, avec les mesures de la montre (« allure tenue sur 5/6 parties ») ; le plan s\'adapte si tu ne tiens pas les allures.',
      'Progrès : 1RM estimé par exercice, avec la tendance (progression, plateau, baisse) et quoi faire.',
      'Coach : semaine allégée proposée après 6 semaines d\'affilée ou quand ta force baisse ; une fois activée, 60 % des séries et charges −10 % pendant 7 jours.',
      'Dynamic Island : fréquence cardiaque de la montre, et « Prêt » quand ton cœur est redescendu pendant le repos (aussi sur la montre).',
    ],
  },
  {
    version: '1.13.1', date: '2026-11-23', title: 'Nouvelle icône',
    items: [
      'Nouvelle icône Kadence : un K blanc et son écho sur fond orange, comme une cadence.',
      'Sur l\'iPhone, l\'Apple Watch, le site et l\'écran de démarrage.',
    ],
  },
  {
    version: '1.13.0', date: '2026-11-23', title: 'Kadeon Sport devient Kadence',
    items: [
      'Nouveau nom : Kadence, la cadence des séries comme celle des foulées.',
      'Le nom change sur l\'iPhone, l\'Apple Watch, la Dynamic Island, le site et la page de confidentialité. Tes données ne bougent pas.',
    ],
  },
  {
    version: '1.12.3', date: '2026-11-23', title: 'Nouveau look sur la montre',
    items: [
      'Apple Watch : fond orange dégradé, gros chiffres arrondis, boutons en pastilles aux couleurs de l\'app (plus de bleu).',
      'Série : une pastille par série de l\'exercice (faites, en cours, à faire), cœur qui bat, charge et reps modifiées en orange.',
      'Repos : anneau dégradé lumineux qui passe au vert les 5 dernières secondes, BPM au centre, prochain exercice et charge en dessous.',
      'Fin de séance : récap en tuiles (durée, séries, volume, BPM, calories).',
    ],
  },
  {
    version: '1.12.2', date: '2026-11-23', title: 'Fréquence cardiaque sur la montre',
    items: [
      'Apple Watch : la séance demande d\'abord l\'accès à Apple Santé, puis démarre la mesure ; avant, elle pouvait démarrer sans accès et n\'afficher aucun BPM.',
      'L\'iPhone peut afficher la demande d\'accès Santé de la montre.',
      'Le temps de séance est en haut à gauche, à côté de l\'heure ; en dessous, le cœur (ou « -- » tant qu\'il n\'y a pas de mesure) et les séries faites.',
      'Le BPM s\'affiche aussi pendant le repos, sous le chrono.',
    ],
  },
  {
    version: '1.12.1', date: '2026-11-23', title: 'Test de la Dynamic Island',
    items: [
      'Profil › Tester la Dynamic Island : une mèche de repos de 30 s pour vérifier l\'affichage, avec la raison si rien n\'apparaît.',
      'La Dynamic Island démarre depuis le fil principal de l\'app (plus fiable).',
    ],
  },
  {
    version: '1.12.0', date: '2026-11-23', title: 'Dynamic Island : la mèche du repos',
    items: [
      'App iPhone : pendant la séance, la Dynamic Island et l\'écran verrouillé montrent la prochaine série et le repos.',
      'Pendant le repos, une mèche orange se consume ; à zéro, elle passe au vert : c\'est reparti.',
      'Record à portée : quand la prochaine série (ou une rep de plus) bat ton record, la mèche devient dorée avec la série à faire.',
      'Depuis l\'écran verrouillé : +15 s, Passer, et Valider la série sans ouvrir l\'app.',
    ],
  },
  {
    version: '1.11.0', date: '2026-11-23', title: 'Course : séance envoyée à la montre',
    items: [
      'Course › Programmer la séance sur la montre › Envoyer à la montre : la séance du plan arrive dans l\'app Exercice de l\'Apple Watch.',
      'Échauffement, fractions, récupérations et retour au calme sont déjà réglés, avec une alerte d\'allure sur chaque partie à tenir (trop rapide, trop lent).',
      'Pendant la course, la montre affiche allure, fréquence cardiaque, cadence, distance et parcours ; la course revient dans Kadeon par Apple Santé.',
    ],
  },
  {
    version: '1.10.0', date: '2026-11-23', title: 'Kadeon Sport sur l\'Apple Watch',
    items: [
      'App iPhone : une app Apple Watch suit la séance en direct, synchronisée avec l\'iPhone.',
      'Sur la montre : exercice et série en cours, charge et reps à la Digital Crown, bouton Valider.',
      'Chrono de repos sur la montre, avec vibrations à la fin, +15 s, −15 s et Passer.',
      'Fréquence cardiaque et calories en direct ; la séance est enregistrée dans Apple Santé et compte dans les anneaux d\'activité.',
      'Démarrer la séance suggérée depuis la montre. Une séance lancée sur l\'iPhone ouvre l\'app sur la montre.',
    ],
  },
  {
    version: '1.9.0', date: '2026-11-22', title: 'Préparation de l\'app iPhone',
    items: [
      'Profil › Supprimer mon compte : efface toutes tes données (exigence de l\'App Store).',
      'Profil › Confidentialité : la politique de confidentialité de Kadeon Sport.',
      'Base de l\'app iPhone : notifications de repos sur le téléphone, écran allumé, import des courses depuis Apple Santé.',
    ],
  },
  {
    version: '1.8.2', date: '2026-11-22', title: 'Nouvelle machine',
    items: [
      'Ajout de « Élévation latérale (machine) » dans la bibliothèque (Épaules, Machine).',
      'Sur machine, le coach monte la charge par paliers de 2,5 kg, y compris pour les élévations, oiseaux et curls.',
    ],
  },
  {
    version: '1.8.1', date: '2026-11-22', title: 'Correction de la nuit',
    items: [
      'Échauffement automatique : un exercice léger (moins de 20 kg) en début de séance ne prive plus le premier exercice lourd du même muscle de ses séries d\'approche.',
      'Les exercices non classés ne se partagent plus un seul échauffement : chacun compte pour lui-même.',
    ],
  },
  {
    version: '1.8.0', date: '2026-11-21', title: 'Échauffement automatique et lest',
    items: [
      'Échauffement automatique : 2 séries d\'approche (50 % × 5, 75 % × 3) sur le premier exercice lourd (20 kg ou plus) de chaque muscle. Réglage dans Profil.',
      'Lest pour tractions et dips : si tu l\'actives dans Profil, le coach propose 2,5 kg de lest dès 12 reps au poids du corps.',
      'Notification de repos à jour : elle reprend la charge et les reps que tu modifies pendant le repos, et se reprogramme seule après une coupure de réseau.',
      'Progrès : « Jambes : 0 série sur 288 depuis le début » et « 1 km couru ».',
    ],
  },
  {
    version: '1.7.5', date: '2026-11-21', title: 'Corrections de la nuit',
    items: [
      'Coach : sur un exercice au poids du corps (0 kg), il propose une rep de plus au lieu d\'ajouter 2,5 kg (« 12 reps ou plus à 0 kg »).',
      'Export CSV : le nom du fichier porte la date du jour en heure belge, plus celle de la veille après minuit.',
    ],
  },
  {
    version: '1.7.4', date: '2026-11-20', title: 'Corrections de la nuit',
    items: [
      'Accords au singulier : « 1 exercice » sous une routine, « 1 course » dans l\'écran Course et l\'administration.',
      'Analyse de séance : « Séries de 10 reps » quand toutes les séries ont le même nombre de reps, au lieu de « 10 à 10 reps ».',
    ],
  },
  {
    version: '1.7.3', date: '2026-11-19', title: 'Histogramme sans mois vides',
    items: [
      'Progrès : le volume mensuel commence au premier mois où tu t\'es entraîné, sans rangée de barres vides avant.',
      'Base de données un peu plus rapide sur les courses et les notifications (règles d\'accès optimisées, sans changement de sécurité).',
    ],
  },
  {
    version: '1.7.2', date: '2026-11-19', title: 'Corrections de la nuit',
    items: [
      'Accords au singulier : « 1 série », « 1 séance », « 1 heure », « 1 exercice » dans l\'analyse de séance, Progrès et l\'accueil.',
      'Conseil « Jambes oubliées » : plus de « pas de séance jambes » à tort ni de « 1 semaines ».',
      'Le conseil « plus de poussée que de tirage » s\'affiche aussi pour les séances Épaules et pectoraux ou Triceps et épaules.',
      'Course : la reprise indique clairement quand les vraies séances de qualité reviennent.',
    ],
  },
  {
    version: '1.7.1', date: '2026-11-18', title: 'Barre d\'onglets centrée',
    items: ['Les cinq onglets occupent toute la barre, bien centrés.'],
  },
  {
    version: '1.7.0', date: '2026-11-18', title: 'Plus simple, plus clair',
    items: [
      'Nouveau schéma anatomique des muscles, face et dos, bien plus détaillé (dorsaux, milieu du dos, lombaires, fessiers…).',
      'Cinq onglets au lieu de six : le bilan du coach s\'ouvre après chaque séance et depuis l\'accueil.',
      'Accueil épuré : les jours de repos n\'affichent plus qu\'une date, le détail du jour n\'apparaît que s\'il y a quelque chose.',
      'Course en trois onglets : Séance, Programme, Suivi.',
      'Progrès réunit toutes les statistiques, avec la carte des muscles travaillés sur 7 jours.',
      'Profil rangé comme les Réglages d\'iOS ; les explications longues sont repliées.',
      'Bilan : les muscles en soutien et les conseils secondaires se déplient à la demande.',
    ],
  },
  {
    version: '1.6.3', date: '2026-11-18', title: 'Illustrations pleine largeur',
    items: ['Fiche exercice : l\'illustration remplit tout son cadre, sans bandes claires sur les côtés.'],
  },
  {
    version: '1.6.2', date: '2026-11-18', title: 'Clavier mieux géré',
    items: ['Quand tu tapes une charge ou des reps, le bandeau « Valider » remonte au-dessus du clavier, le champ reste visible et la page défile jusqu\'en bas.'],
  },
  {
    version: '1.6.1', date: '2026-11-18', title: 'Repos visible en haut',
    items: ['Pendant un repos, le chrono s\'affiche aussi dans l\'en-tête de séance, à côté des séries : il reste visible même quand tu fais défiler la page.'],
  },
  {
    version: '1.6.0', date: '2026-11-18', title: 'Analyse de séance',
    items: [
      'Après chaque séance (Coach) et dans chaque séance de l\'historique : la zone travaillée est détectée automatiquement.',
      'Schéma du corps face et dos : chaque muscle se colore selon le nombre de séries reçues. Touche un muscle pour savoir ce qu\'il fait et quels exercices l\'ont travaillé.',
      'Conseils pour améliorer la séance, chacun avec sa source scientifique : volume par séance et par semaine, fréquence, choix des exercices, ordre, plages de reps, équilibre poussée et tirage, jambes.',
    ],
  },
  {
    version: '1.5.4', date: '2026-11-18', title: 'Petites corrections de la nuit',
    items: [
      'Coach : la charge conseillée (ex. « 65,8 kg ») ne se cache plus sous le bouton + sur l\'écran de l\'iPhone.',
      'Notifications de repos : en appuyant deux fois vite sur +15 s, l\'ancienne notification « Repos terminé » pouvait arriver trop tôt. Corrigé.',
      'Notification au poids du corps : « Traction : × 8 » au lieu de « 0 kg × 8 ».',
      'Singulier quand il n\'y en a qu\'un : « 1 séance », « 1 série » (bibliothèque, historique, progrès, fin de séance, import, coach).',
    ],
  },
  {
    version: '1.5.3', date: '2026-11-17', title: 'Le coach s\'applique vraiment',
    items: [
      'Une routine créée avec les noms de la bibliothèque (« Développé couché (haltères) ») retrouve maintenant ton historique importé (« Développé Couché (Haltère) ») : charges du coach, séries précédentes et records sont repris.',
    ],
  },
  {
    version: '1.5.2', date: '2026-11-17', title: 'Accessibilité et finitions (Web Interface Guidelines)',
    items: [
      'Fiches : Échap ferme, la page derrière ne défile plus, le focus entre dans la fiche et revient au bon endroit.',
      'Titres de section lus comme de vrais titres par VoiceOver ; erreurs annoncées.',
      'Recherche : clavier « Rechercher », sans correction automatique, avec contour au focus.',
      'Liste d\'exercices plus fluide, effets de survol au trackpad, en-tête et barre d\'onglets qui ne masquent plus l\'élément sélectionné.',
    ],
  },
  {
    version: '1.5.1', date: '2026-11-17', title: 'Écran allumé ou montre',
    items: ['Réglage « Garder l\'écran allumé pendant la séance » : désactivé, l\'iPhone se verrouille et les notifications de repos passent sur la montre.'],
  },
  {
    version: '1.5.0', date: '2026-11-17', title: 'Compte à rebours du repos sur la montre',
    items: ['Option de notifications toutes les 15 ou 30 secondes pendant le repos, avec le temps restant ; chacune remplace la précédente.'],
  },
  {
    version: '1.4.0', date: '2026-11-17', title: 'Fin de repos sur la montre',
    items: [
      'Notifications de fin de repos, avec la série suivante : sur l\'iPhone et, quand il est verrouillé, sur l\'Apple Watch.',
      'À activer dans Profil › Notifications, depuis l\'app ajoutée à l\'écran d\'accueil.',
    ],
  },
  {
    version: '1.3.1', date: '2026-11-17', title: 'Message clair quand trop d\'e-mails sont envoyés',
    items: ['La limite d\'envoi d\'e-mails est expliquée en français, avec la solution.'],
  },
  {
    version: '1.3.0', date: '2026-11-17', title: 'Mot de passe et administration',
    items: [
      'Connexion par e-mail et mot de passe, en plus du lien par e-mail, avec « Mot de passe oublié ».',
      'Profil : définir ou changer son mot de passe.',
      'Rôle superadmin et écran Administration (comptes, activité, rôles).',
    ],
  },
  {
    version: '1.2.0', date: '2026-11-17', title: 'Kadeon Sport',
    items: ['L\'app s\'appelle maintenant Kadeon Sport et a sa propre adresse : sport.kadeon.be.'],
  },
  {
    version: '1.1.1', date: '2026-11-17', title: 'Tes jours de course respectés pendant la reprise',
    items: [
      'Pendant la reprise après une pause, un jour « Qualité » reste une séance de qualité, en version allégée (lignes droites, puis fartlek doux), au lieu de devenir un simple footing sans explication.',
      'La date de retour des vraies séances est indiquée, et la reprise progressive peut être désactivée.',
      'Un footing facile ne dépasse plus une heure quand aucune sortie longue n\'est prévue.',
    ],
  },
  {
    version: '1.1.0', date: '2026-11-17', title: 'Date de début du programme',
    items: [
      'Course : choisis la date de début de ton programme, aujourd\'hui ou plus tard, et modifie-la ensuite.',
      'Avant le début, l\'onglet Course indique quand le plan commence ; la reprise après pause se cale sur ce jour.',
    ],
  },
  {
    version: '1.0.0', date: '2026-11-17', title: 'Coach course sur tes vraies courses',
    items: [
      'Le coach course lit ton historique : niveau tiré de ta meilleure course récente, volume habituel, et reprise adaptée après une pause (méthode Daniels).',
      'Calendrier : toucher un jour ouvre directement la séance ou la course.',
      'Fiche détaillée pour chaque course : allure, fréquence cardiaque, niveau équivalent.',
      'Numéro de version, nouveautés, et alerte quand une mise à jour est en ligne.',
    ],
  },
  {
    version: '0.9.0', date: '2026-11-17', title: 'Calendrier et Strava',
    items: [
      'Calendrier mensuel dans le profil.',
      'Import des courses Strava depuis l\'archive du compte (français et anglais).',
      'Icône par jour sur l\'accueil, détail du jour au toucher.',
      'Fin des tremblements de page, fiche de séance repensée.',
    ],
  },
  {
    version: '0.8.0', date: '2026-11-17', title: 'Coach course complet',
    items: [
      'Allures VDOT (Daniels), phases de préparation, semaines allégées, affûtage, jour J.',
      'Choix des jours de course et du type de sortie par jour.',
      'Arrêter un programme.',
    ],
  },
  {
    version: '0.7.0', date: '2026-11-17', title: 'Historique et audits',
    items: [
      'Historique des séances : détail, renommer, supprimer. Export CSV.',
      'Record signalé en direct, écran allumé pendant la séance, recherche sans accents.',
      'Bandeau en verre liquide, en-têtes et barres assortis.',
    ],
  },
  {
    version: '0.6.0', date: '2026-11-16', title: 'Nouvelle identité visuelle',
    items: ['Orange dossard, chiffres en Archivo, thème clair et sombre revus.', 'Correctifs : exercices au poids du corps, enregistrement interrompu, séries vides.'],
  },
  {
    version: '0.5.0', date: '2026-11-16', title: 'Course à pied',
    items: ['Plan de course adaptatif, séance dessinée, instructions pour l\'app Exercice.', 'Lecture gratuite des captures d\'écran sur le téléphone.'],
  },
  {
    version: '0.4.0', date: '2026-11-14', title: 'Coach muscu',
    items: ['Une carte par exercice avec la charge conseillée, réglable.', 'Échauffements calculés automatiquement.'],
  },
  {
    version: '0.3.0', date: '2026-11-14', title: 'Séances comme dans Hevy',
    items: ['Routines, supersets, temps de repos par exercice, types de série.', '208 exercices illustrés.'],
  },
  {
    version: '0.1.0', date: '2026-11-14', title: 'Première version',
    items: ['Suivi des séances, import Hevy, progrès, vue montre.'],
  },
];
