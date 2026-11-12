# Everywhere — Design System (source de vérité)

Généré avec le skill `ui-ux-pro-max`, puis adapté au produit : une appli de
cartographie et de reporting utilisée aussi bien par des personnes à l'aise
avec la technologie que par des personnes qui la découvrent.

## Principes

1. **Lisible d'abord.** Texte de base 17px, jamais sous 13px, contraste ≥ 4.5:1.
2. **Une action évidente par écran.** Un seul bouton plein (primaire) ; le reste en contour.
3. **Des mots simples.** Chaque page a un titre et une phrase qui dit quoi faire.
4. **Gros doigts bienvenus.** Zones cliquables ≥ 44px sur écran tactile.
5. **Calme.** Fond uni, pas de dégradés ni d'ombres lourdes, la couleur sert à informer.

## Style

**Minimalisme suisse** — grille nette, beaucoup d'espace, bordures fines plutôt
qu'ombres, transitions de couleur 150–200ms, `prefers-reduced-motion` respecté.

## Couleurs

| Rôle | Hex | Token Tailwind |
|------|-----|----------------|
| Primaire (actions, liens, sélection) | `#0C6A85` | `primary-600` |
| Primaire survol | `#0B566D` | `primary-700` |
| Primaire teinte (fond sélectionné) | `#EEF9FC` | `primary-50` |
| Accent (rare : mise en avant) | `#C2410C` | `accent-600` |
| Fond de page | `#F8FAFC` | `neutral-50` |
| Carte | `#FFFFFF` | `white` |
| Texte | `#1E293B` | `neutral-800` |
| Texte secondaire | `#475569` | `neutral-600` |
| Bordure | `#E2E8F0` | `neutral-200` |
| Succès | `#15803D` | `success-500` |
| Alerte | `#F59E0B` (texte foncé dessus) | `warning-500` |
| Danger | `#DC2626` | `danger-500` |

Dans `tailwind.config.js`, `blue` et `indigo` pointent sur l'échelle primaire,
et `gray` / `neutral` sur `slate` : une seule teinte d'interface, un seul gris.
Les couleurs de **statut DMM** (orange, jaune, vert, rouge) restent sémantiques
et ne doivent jamais être le seul signal : toujours accompagner d'un libellé.

## Typographie

- **Titres : Lexend** (500–600) — `font-display`, classes `.page-title`, `.section-title`, `.card-title`.
- **Texte : Source Sans 3** (400–700) — `font-sans`.
- Échelle : xs 13 · sm 15 · base 17 · lg 19 · xl 21 · 2xl 24 · 3xl 30 · 4xl 34.

## Composants (classes dans `src/index.css`)

| Besoin | Classe |
|--------|--------|
| Action principale | `btn-primary` |
| Action secondaire | `btn-secondary` |
| Supprimer / rejeter (discret) | `btn-danger-outline` · confirmé : `btn-danger` |
| Petit bouton (tableaux) | ajouter `btn-sm` |
| Champ + libellé + aide + erreur | `form-input` · `form-label` · `form-helper` · `form-error` |
| Carte | `card` |
| Titre de page + phrase d'aide | `page-title` · `page-subtitle` |
| Tableau | `data-table` |
| Pastille | `badge-*` |

## Règles à respecter

- Icônes : **Lucide** uniquement, jamais d'emoji comme icône ; `aria-hidden` si décorative, `aria-label` sur un bouton sans texte.
- Tout champ a un `<label>` visible ; l'erreur s'affiche sous le champ (`role="alert"`).
- Focus clavier visible partout (anneau 3px primaire) — ne jamais le retirer.
- Pas de `text-gray-400` pour du texte sur fond clair ; minimum `-500`.
- Pas de taille en pixels arbitraire sous `text-xs`.
- Mode sombre : chaque surface a sa variante `dark:` (fond `slate-800/900`).
- Responsive : vérifier 375, 768, 1024, 1440 ; pas de défilement horizontal de page.
