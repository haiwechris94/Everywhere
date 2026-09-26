# Guide — Import trimestriel des engagements New Generation (NG) — Zone FCA

Ce guide décrit la procédure complète pour mettre à jour la carte à chaque nouveau
rapport trimestriel New Generation (NG) de la zone **FCA (Francophone Central Africa)**,
depuis le fichier Excel source jusqu'au rafraîchissement du tableau de bord.

Le principe clé : **un import trimestriel met à jour les enregistrements existants
(pas de doublon) et conserve un historique daté par trimestre.**

---

## 1. Vue d'ensemble du flux

```
Fichier .xlsx trimestriel (ex. FRANCOPHONE CENTRAL AFRICA 3Q26.xlsx)
        │
        │  node scripts/convertNgQuarter.js  (conversion + matching JP/CPPI + coordonnées)
        ▼
CSV normalisé (ex. NG_FCA_3Q26_import.csv)  +  rapport de matching (.md)
        │
        │  Écran « Données » → onglet « Importer » → glisser-déposer
        ▼
UPSERT par (nom + pays) dans MongoDB  →  historique trimestriel ajouté
        │
        │  Événement Socket.IO + invalidation des requêtes React Query
        ▼
Carte + tableau de bord rafraîchis automatiquement
```

---

## 2. Zone FCA — pays inclus

Seuls ces 7 pays sont conservés à la conversion (les autres sont exclus et listés dans le rapport) :

| Pays | Statut |
|------|--------|
| Cameroun | ✅ inclus |
| République Centrafricaine | ✅ inclus |
| Tchad | ✅ inclus |
| Congo (Brazzaville) | ✅ inclus |
| Congo (RDC) | ✅ inclus |
| Guinée Équatoriale | ✅ inclus |
| Gabon | ✅ inclus |

> Les lignes hors FCA (ex. Ouganda, Rwanda) sont **exclues automatiquement** et
> listées dans le rapport `..._match_report.md` pour vérification.

---

## 3. Étape 1 — Convertir le fichier `.xlsx` en CSV

Le script `backend/scripts/convertNgQuarter.js` lit les 2 onglets du fichier
(`Data` + `New Engagements`), rattache chaque engagement à un peuple, calcule les
coordonnées et le statut DMM, et génère un CSV prêt à l'import.

### Commande

Depuis le dossier `backend/` (là où le paquet `xlsx` est installé) :

```bash
cd backend
node scripts/convertNgQuarter.js "data/FRANCOPHONE CENTRAL AFRICA 3Q26.xlsx" 3Q26
```

- **1er argument** : chemin du fichier `.xlsx` du trimestre.
- **2e argument** : le trimestre (`reportPeriod`), ex. `3Q26`. Il est écrit dans chaque
  ligne du CSV et sert d'étiquette d'historique.
- **3e argument** (optionnel) : chemin de sortie du CSV. Par défaut :
  `data/NG_FCA_<reportPeriod>_import.csv`.

### Résultat

- `data/NG_FCA_3Q26_import.csv` — le fichier à importer.
- `data/NG_FCA_3Q26_import_match_report.md` — rapport détaillé : nombre de lignes
  gardées/exclues et répartition des sources de coordonnées.

### Comment sont trouvées les coordonnées ?

Pour chaque engagement, la position est déterminée dans cet ordre de priorité :

1. **JP exact** (`AUTO_JP`) — correspondance de nom exacte avec Joshua Project.
2. **JP approché** (`REVIEW_JP`) — correspondance canonique/similarité (à revérifier).
3. **CPPI** (`REVIEW_CPPI`) — coordonnées issues du fichier `people_groups.csv`.
4. **Centroïde pays** (`CENTROID`) — position approximative au centre du pays, avec
   un léger décalage pour éviter la superposition. **À affiner manuellement** ensuite
   depuis l'interface (voir §5).

> Les lignes `CENTROID` sont listées dans le rapport de matching pour être corrigées.

---

## 4. Étape 2 — Importer le CSV dans l'application

1. Démarrer le backend puis le frontend :
   ```bash
   cd backend && npm start
   cd frontend && npm run dev
   ```
2. Ouvrir le menu **« Données »** (`/data-management`).
3. Aller sur l'onglet **« Importer »**.
4. **Glisser-déposer** le fichier `NG_FCA_3Q26_import.csv` (ou cliquer pour le sélectionner).
5. Vérifier l'aperçu (5 premières lignes + nombre total de lignes).
6. Cliquer sur **« Importer N lignes »**.

### Ce qui se passe côté serveur (UPSERT trimestriel)

Pour chaque ligne, l'import recherche un peuple existant par **nom + pays** (source
`DMM` / `Survey` / `manual`) :

- **S'il existe** → mise à jour de : `numberOfChurches`, `churchGeneration`,
  `dbs`, `com`, `cat`, `reportPeriod`, `engagementStatus`/`status`, et **ajout d'un
  point d'historique** daté du trimestre (ex. *« Trimestre 3Q26 (précédent : 2Q26)
  — N églises, G gén, DBS d, COM c, CAT t »*).
- **Sinon** → création d'un nouvel enregistrement.

Le résumé de l'import distingue **créés** et **mis à jour**. Aucun doublon n'est créé.

---

## 5. Étape 3 — Modifier un engagement depuis l'interface

Sur la fiche d'un peuple (`PeopleGroupDetail`), le bouton **Modifier** permet d'éditer :

- **Coordonnées** (latitude / longitude) — utile pour affiner les placeholders `CENTROID`.
- **Nom** de l'engagement.
- **Chiffres** : nombre d'églises (`numberOfChurches`), générations (`churchGeneration`),
  **DBS**, **COM**, **CAT**.
- **Trimestre** (`reportPeriod`, ex. `2Q26`).

Les valeurs DBS / COM / CAT sont aussi affichées en lecture seule sur la fiche.

---

## 6. Étape 4 — Rafraîchissement du tableau de bord

Aucune action manuelle n'est requise :

- L'import émet un **événement Socket.IO** (`people-groups-imported`) ; la carte et les
  vues abonnées se mettent à jour en direct.
- À la fin de l'import, `DataManagement.jsx` **invalide les requêtes React Query** du
  tableau de bord et des analyses :
  `peopleGroups`, `dashboardStats`, `dashboardKPI`, `dashboardStatusDistribution`,
  `dashboardCoverage`, ainsi que les clés `analytics-*` (résumé IA, activité,
  croissance DMM, top régions, peuples, timeline).
- En complément, les vues du tableau de bord se rafraîchissent aussi par interrogation
  périodique.

Si un widget semble figé, recharger la page force un rafraîchissement complet.

---

## 7. Modèle de progression (non atteint → atteint)

Le statut DMM est recalculé à partir du **nombre total d'églises** :

| Églises | Statut (`engagementStatus`) | Libellé |
|--------:|-----------------------------|---------|
| 0 | `unreached` | Non atteint |
| 1 – 33 | `pioneer` | Pionnier |
| 34 – 66 | `midway` | Mi-parcours |
| 67 – 99 | `tipping-point` | Point de bascule |
| 100 + | `dmm` | Mouvement (atteint) |

> Le statut **« atteint » au sens missiologique** (JPScale / least-reached) provient de
> Joshua Project / IMB et reste la référence pour la couverture. Le statut DMM
> ci-dessus mesure la **dynamique de l'engagement NG** au fil des trimestres, visible
> dans l'historique de chaque peuple.

---

## 8. Format du CSV généré

En-têtes (séparateur virgule, une ligne par engagement) :

```
name,latitude,longitude,villageName,population,numberOfChurches,churchGeneration,dbs,com,cat,reportPeriod,engagementStatus,region,country,language,religion,description
```

- `reportPeriod` = le trimestre passé au script (ex. `3Q26`).
- `region` = `Francophone Central Africa`.
- `description` = résumé lisible (métriques + source du matching JP/CPPI/centroïde).

---

## 9. Récapitulatif — checklist trimestrielle

- [ ] Récupérer le nouveau fichier `.xlsx` dans `backend/data/`.
- [ ] `node scripts/convertNgQuarter.js "<fichier>.xlsx" <trimestre>`.
- [ ] Lire le rapport `..._match_report.md` (exclusions + placeholders `CENTROID`).
- [ ] Importer le CSV via **Données → Importer**.
- [ ] Vérifier le résumé (créés / mis à jour).
- [ ] Affiner les coordonnées `CENTROID` depuis les fiches concernées.
- [ ] Confirmer que le tableau de bord reflète les nouveaux chiffres.

---

## 10. Fichiers et dépannage

| Élément | Emplacement |
|---------|-------------|
| Script de conversion | `backend/scripts/convertNgQuarter.js` |
| Route d'import (UPSERT + historique + socket) | `backend/routes/import.js` |
| Modèle (champs `dbs`/`com`/`cat`/`reportPeriod`) | `backend/models/PeopleGroup.js` |
| Écran d'import + invalidation dashboard | `frontend/src/pages/DataManagement.jsx` |
| Fiche d'édition d'un engagement | `frontend/src/pages/PeopleGroupDetail.jsx` |
| Calcul du statut DMM | `backend/.../dmmStatusCalculator.js` |

**Dépannage courant**

- *« xlsx est requis »* → lancer le script depuis `backend/` (`cd backend` d'abord).
- *Fichier introuvable* → vérifier le chemin (guillemets si le nom contient des espaces).
- *Des lignes attendues sont absentes* → vérifier la section « Exclues (hors FCA) » du
  rapport de matching : le pays n'est peut-être pas dans la zone FCA.
- *Doublons créés* → vérifier que `name` et `country` correspondent aux enregistrements
  existants ; l'UPSERT se base sur ce couple.
