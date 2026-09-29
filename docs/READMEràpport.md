# FADES-RH — Module Rapports V2

Cette mise à jour part des fichiers fournis par le projet et conserve la structure
du module. Les changements portent sur la propriété du rapport, la sécurité,
les exports PDF/Word et l'expérience utilisateur.

## Règle centrale

Un rapport appartient au compte qui l'a créé (`createdByUserId`).

Seul ce compte peut modifier :
- le titre ;
- la contribution rédactionnelle ;
- le contenu éditorial ;
- le recalcul des données.

Un RH, un Chef de département/Direction ou un Administrateur qui consulte le
rapport d'une autre personne ne peut plus éditer ou recalculer ce contenu.

## Validation

La validation reste une action de contrôle et non une modification du contenu.

- le rédacteur ne peut pas auto-valider son propre rapport ;
- Direction / RH / Administrateur peuvent valider selon leur périmètre ;
- après validation, le rapport est figé ;
- un rapport validé ne peut plus être recalculé ;
- l'archivage est une action institutionnelle distincte.

## Suppression

- l'Administrateur conserve une capacité globale ;
- le créateur peut supprimer son rapport uniquement avant validation ;
- le RH ne peut plus supprimer librement le rapport d'un autre rédacteur.

## Export PDF

Le bouton PDF crée un vrai fichier `.pdf` côté navigateur via `jsPDF`.
Le rendu utilise le document affiché dans le drawer, sans l'ancien en-tête
institutionnel ni l'ancien pied de page.

Dépendances frontend :

```powershell
npm install -w @fades/web jspdf html2canvas
```

Les imports sont dynamiques : les bibliothèques d'export ne sont chargées
qu'au moment où l'utilisateur clique sur PDF.

## Export Word

Le bouton Word produit un document `.doc` compatible Microsoft Word à partir
du même contenu. Aucun package supplémentaire n'est nécessaire.

## En-tête / pied de page

Les blocs suivants ont été retirés du JSX du rapport :

```text
report-official-letterhead
report-document-footer
```

Ils sont également neutralisés dans le CSS pour empêcher une réapparition
accidentelle lors de l'impression ou de l'export.

## Permissions renvoyées par le backend

Chaque rapport expose maintenant :

```ts
report.permissions = {
  isOwner,
  canEdit,
  canRecompute,
  canValidate,
  canArchive,
  canDelete,
  canDownload,
  readOnly,
}
```

Le frontend se contente d'utiliser ces permissions. Il ne reconstitue plus les
droits de modification à partir du rôle.

## Fichiers modifiés

Backend :
- `report.access.ts`
- `report.controller.ts`
- `report.service.ts`
- `report.types.ts`

Frontend :
- `report.types.ts`
- `ReportsPage.tsx`
- `ReportDetailsDrawer.tsx`
- `report-page.css`

Les autres fichiers sont inclus dans le package comme référence, sans changement
métier majeur.

## Commandes de vérification

Depuis la racine du monorepo :

```powershell
npm install -w @fades/web jspdf html2canvas
npm run typecheck
npm run build
```

## Scénario de test prioritaire

1. Chef de service A génère un rapport.
2. Chef de service A voit `Compléter` et `Recalculer`.
3. Direction / RH voient le rapport mais ne peuvent pas modifier son contenu.
4. Une personne habilitée distincte valide le rapport.
5. Le rapport validé devient figé pour tout le monde.
6. PDF et Word restent téléchargeables.
7. Les documents exportés ne contiennent ni l'ancien en-tête ni l'ancien pied de page.
