# Détection automatique des montées et descentes — Design

## Problème

L'algorithme actuel classe chaque step (distance entre deux points GPX) comme "up", "down" ou "flat"
selon un seuil fixe de `dh > 2m`. Les steps "flat" héritent de la dernière direction.
Ceci produit :

- Trop de micro-sections (39 sections pour 75km sur Festival des Hospitaliers)
- Des segments mal étiquetés (ex: "up" avec dénivelé négatif sur Afternoon Trail Run)
- Aucune vision macro du parcours

## Objectif

Remplacer par un algorithme multi-échelles qui détecte les points d'ancrage (pics/valiées)
significatifs du profil altimétrique, produisant une vue macro avec ~5-10 sections par parcours.

## Algorithme

### Étapes

1. **Lissage altitude** (fenêtre 40m) — conservé de l'existant
2. **Calcul pentes** (fenêtre 60m) — conservé de l'existant
3. **Détection des extremums locaux** sur l'altitude lissée :
   - Points où la pente change de signe (positive→négative = pic, négative→positive = vallée)
4. **Filtrage hiérarchique des ancres** :
   - Un pic est gardé s'il est à au moins `min_peak_deniv` (50m) au-dessus des vallées adjacentes
   - Si deux pics sont trop proches (< 500m), on garde le plus haut
   - Même logique pour les vallées (on garde la plus basse)
5. **Segmentation** entre ancres consécutives :
   - `dir = "up"` si altitude de fin > altitude de début
   - `dir = "down"` si altitude de fin < altitude de début
   - `dir = "flat"` si la pente moyenne est < 3%
6. **Validation multi-échelle** :
   - Pour chaque point de changement de direction, vérifier la cohérence
     sur une fenêtre large (200m) avant de créer une ancre
   - Évite les faux positifs dus au bruit résiduel
7. **Fusion des sections plates** :
   - Les sections "flat" courtes (< 500m) sont absorbées dans le segment adjacent
   - Les sections "flat" plus longues sont conservées comme segments distincts
8. **Filtrage final** par `min_dist_m` et `min_deniv_m` (paramètres UI existants)

### Pseudo-code

```
function detectSections(pts, xs, eleSmoothed, slopes, minPeakDeniv, minDist):
  extrema = findLocalExtrema(eleSmoothed)
  // extrema = indices where slope changes sign

  anchors = filterAnchors(extrema, xs, eleSmoothed, minPeakDeniv, 500)
  // Remove insignificant peaks/valleys

  sections = buildSections(anchors, xs, eleSmoothed, slopes)
  // Each pair [anchor[i], anchor[i+1]] becomes a section

  sections = mergeFlatSections(sections, flatSlope=3%, maxFlatDist=500m)

  return sections.filter(s => s.dist > minDist && |s.deniv| > minDeniv)
```

## Types

```typescript
interface Anchor {
  type: "peak" | "valley";
  index: number;
  km: number;
  ele: number;
}
```

`SectionData.dir` accepte `"up" | "down" | "flat"`.

## Nouvelles fonctions dans `analyze.ts`

| Fonction | Rôle |
|---|---|
| `findLocalExtrema(ele: number[]): Anchor[]` | Trouve les pics et vallées locaux |
| `filterAnchors(anchors, xs, ele, minPeakDeniv, minDist): Anchor[]` | Filtre les ancres insignifiantes |
| `buildSections(pts, xs, ele, slopes, anchors): SectionData[]` | Construit les sections entre ancres |
| `mergeFlatSections(sections, flatSlopeThreshold, maxFlatDist): SectionData[]` | Fusionne les plats courts |

## Paramètres

| Paramètre | Défaut | Rôle |
|---|---|---|
| `min_peak_deniv` | 50m | Dénivelé mini entre pic et vallée adjacente |
| `min_anchor_dist` | 500m | Distance mini entre deux ancres du même type |
| `flat_slope_threshold` | 3% | Pente en dessous de laquelle on considère plat |
| `flat_merge_dist` | 500m | Distance max d'une section plate à fusionner |
| `smooth_window` | 40m | Fenêtre de lissage (existant) |

Les paramètres `min_dist_m` et `min_deniv_m` de l'UI restent inchangés et s'appliquent
en filtrage final.

## Tests

Dans `server/analyze.test.ts` :

- `findLocalExtrema` sur profil sinusoïdal → trouve les bons pics/valiées
- `filterAnchors` élimine les petites ondulations
- `buildSections` depuis des ancres → segmentation correcte
- Test sur `simple.gpx` : 2 sections — montée puis descente (plus de "flat" erroné)
- Test avec filtres min_dist/min_deniv : sections filtrées correctement
- Tests sur les 3 GPX réels : nombre de sections raisonnable (~5-15)

## Comportement attendu

| GPX | Sections actuelles | Sections attendues |
|---|---|---|
| Trail des Lacs (~51km) | 8 | ~6 (macro montées/descentes) |
| Festival des Hospitaliers (~76km) | 39 | ~8-12 |
| Afternoon Trail Run (~29km) | 5 | ~2-4 |
