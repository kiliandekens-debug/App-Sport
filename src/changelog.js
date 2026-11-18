// Release notes, newest first. At each release: bump "version" in package.json
// (major.minor.patch: patch = fixes, minor = new features, major = big changes) and add an entry here.
export const VERSION = __APP_VERSION__;
export const BUILD = __APP_BUILD__;
export const BUILT_AT = __APP_BUILT_AT__;

export const CHANGELOG = [
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
