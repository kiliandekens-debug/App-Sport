# Salle — suivi d'entraînement

App web (Vite + React + Supabase) pour noter ses séances de musculation, suivre sa progression et recevoir des conseils de charge.

## Écrans

- **Accueil** : semaine en cours, séance suggérée (rotation de ton programme), reprise d'une séance en cours.
- **Séance** : saisie série par série (kg, reps), minuteur de repos, volume en direct. Sur grand écran (iPhone Duo ouvert, tablette), le programme et l'exercice en cours s'affichent côte à côte.
- **Montre** (`/montre`) : vue compacte, une information par écran : série en cours, repos, exercice suivant, fin de séance.
- **Exercices** : ton historique, une bibliothèque de base et tes variantes perso, filtrables par muscle et matériel.
- **Variante** : créer sa version d'un exercice (sens, prise, unilatéral).
- **Progrès** : charge max, volume ou reps par séance pour chaque exercice, records personnels.
- **Coach** : bilan de la dernière séance et charges proposées pour la suivante (règles de double progression, pas d'IA en ligne).
- **Profil** : statistiques globales, volume mensuel, répartition par muscle, import d'un export Hevy (.csv).

## Données

Base Supabase, tables `workouts`, `sets`, `custom_exercises`, `coach_plans`, toutes protégées par RLS : chaque compte ne voit que ses propres lignes. Le schéma est dans `supabase/schema.sql`.

Connexion par lien magique envoyé par e-mail.

## Lancer en local

```bash
cp .env.example .env.local   # renseigner l'URL et la clé publishable Supabase
npm install
npm run dev
```
