// Release notes, newest first. At each release: bump "version" in package.json
// (major.minor.patch: patch = fixes, minor = new features, major = big changes) and add an entry here.
export const VERSION = __APP_VERSION__;
export const BUILD = __APP_BUILD__;
export const BUILT_AT = __APP_BUILT_AT__;

export const CHANGELOG = [
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
