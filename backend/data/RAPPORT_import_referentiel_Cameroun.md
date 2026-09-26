# Rapport d'import — Référentiel peuples Cameroun

**Source :** `backend/data/Cameroon_PGs.xlsx` (onglet `PGs`)
**Script :** `backend/scripts/importPeoplesReference.js`
**Mode :** Import réel (upsert par `name` + `villageName` + `country`)
**Créés par :** chrishaiwe@gmail.com (approuvés automatiquement)

## Résumé

| Indicateur | Valeur |
|---|---|
| Peuples/villages importés | **121** |
| Créés (nouveaux) | 121 |
| Mis à jour | 0 |
| Erreurs | 0 |
| Sans coordonnées (onglet `Error`) | **non importés** (choix confirmé) |
| Avec langue renseignée | 121 / 121 |
| Avec population (> 0) | 101 / 121 |
| Pays | Cameroon (`CM`) |

Tous les peuples importés ont des coordonnées GPS valides → **visibles sur la carte**.

## Répartition par région (Province)

| Région | Peuples |
|---|---|
| Extrême-Nord | 48 |
| Adamaoua | 24 |
| Nord-Ouest | 23 |
| Centre | 9 |
| Est | 8 |
| Sud | 4 |
| Nord | 3 |
| Ouest | 2 |

## Top départements (admin2)

| Département | Peuples |
|---|---|
| Mezam | 16 |
| Mayo-Tsanaga | 14 |
| Vina | 14 |
| Djerem | 9 |
| Mayo-Sava | 8 |
| Logone-et-Chari | 8 |
| Mayo-Danay | 7 |
| Mayo-Kani | 7 |
| Mfoundi | 7 |

## Mapping appliqué (fichier → base)

| Colonne Excel | Champ modèle |
|---|---|
| People_Group | `name` |
| Village | `villageName` |
| District | `admin3` (arrondissement) |
| Department | `admin2` (département) |
| Province | `region` |
| Language | `language` |
| Religious_Background | `religion` |
| Population_Size | `population` (1er nombre) + texte original conservé dans `description` / `sourceData.populationText` |
| Latitude / Longitude | `location.coordinates` `[lng, lat]` |
| Country | `country` + `countryCode` (alpha-2) |
| Notes / Affinity_Group / Urban_Rural / Start_Date / E2M_Stage | `description` + `sourceData` (brut, traçabilité) |

## Notes importantes

- **Statut initial = `unreached`** pour tout le référentiel : c'est le socle géographique, sans métriques d'engagement. Les statuts évolueront via les **imports trimestriels** (DBS/COM/CAT/églises).
- **Onglet `Error` (18 lignes) non importé** comme demandé. À géolocaliser plus tard puis à réimporter.
- **`Start_Date` et `E2M_Stage`** restent vides dans le fichier source (données de suivi internes) — à compléter depuis vos registres.
- **Point à corriger (signalé dans l'onglet Méthodologie)** : lignes Gawar / Longuéré Haoussa / Wouro Ladde indiquent District « Mokolo » avec Department « Mayo-Sava », alors que Mokolo est dans le Mayo-Tsanaga.
- **Même peuple, plusieurs villages** : ex. « Bana » importé distinctement à Mahaou et Gamboura (clé nom+village+pays).

## Fichiers produits / modifiés

- `backend/scripts/importPeoplesReference.js` — nouveau script d'import référentiel (multi-pays).
- `backend/routes/import.js` — upsert trimestriel aligné sur **nom + village + pays**.
- `backend/data/TEMPLATE_referentiel_peuples.csv` — template pour ajouter de futurs peuples.
- `backend/data/TEMPLATE_suivi_trimestriel.csv` — template pour les imports trimestriels (par trimestre et par pays).
