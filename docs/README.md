# FADES-RH — Roadmap Ownership & Validation V10

Cette version met à jour la logique Roadmap sans changer l'architecture du module.

## Problèmes corrigés

### 1. Modification d'une feuille par une autre personne

Le contrôle historique utilisait principalement `agentId`.
Le nouveau contrôle utilise `createdByUserId`.

Cela empêche un autre compte rattaché à la même fiche Agent de modifier ou
soumettre une feuille qu'il n'a pas créée.

### 2. Circuit Chef de service

Ancien circuit :

```text
Chef de service -> Direction -> RH
```

Nouveau circuit :

```text
Chef de service -> Direction -> APPROVED
```

Le RH conserve la lecture globale et le téléchargement des pièces KPI, mais
n'intervient plus dans la validation de cette feuille.

### 3. Circuit Direction

```text
Direction -> RH -> APPROVED
```

Le RH peut valider / retourner la feuille de Direction, mais ne peut jamais
modifier les objectifs ni déposer le KPI à la place de son propriétaire.

### 4. Réalisations KPI

Seul le compte propriétaire peut :

- marquer une mission réalisée ;
- déposer le commentaire KPI ;
- uploader / remplacer sa preuve.

Le validateur hiérarchique peut uniquement :

- consulter ;
- télécharger la preuve ;
- valider le KPI ;
- demander une discussion.

### 5. Verrouillage

```text
NOT_SUBMITTED
    ↓ propriétaire renseigne
PENDING_REVIEW   [verrouillé]
    ↓
    ├── VALIDATED          [verrouillage définitif]
    └── NEEDS_DISCUSSION   [rouvert au propriétaire]
              ↓ correction propriétaire
         PENDING_REVIEW
```

### 6. Téléchargement

Le téléchargement suit le droit de lecture :

- Chef de service : pièces des Agents de son Service ;
- Direction : pièces relevant de sa Direction ;
- RH : lecture globale ;
- Admin : lecture globale ;
- propriétaire : ses propres pièces.

Le chemin serveur n'est jamais exposé au frontend.

## Fichiers modifiés

Backend :

```text
apps/api/src/modules/roadmaps/roadmap.access.ts
apps/api/src/modules/roadmaps/roadmap.service.ts
apps/api/src/modules/roadmaps/roadmap.types.ts
```

Les controller/model/routes/schema/upload sont inclus dans le ZIP mais ne
nécessitent pas de changement de logique.

Frontend :

```text
apps/web/src/features/roadmaps/roadmap.types.ts
apps/web/src/features/roadmaps/roadmap.utils.ts
apps/web/src/pages/roadmaps/RoadmapsPage.tsx
apps/web/src/pages/roadmaps/RoadmapDetailsDrawer.tsx
apps/web/src/pages/roadmaps/roadmaps-page.css
```

## Pourquoi les permissions viennent maintenant du backend

Le backend renvoie désormais :

```text
roadmap.permissions
item.permissions
```

Le frontend n'a donc plus à reconstruire lui-même les règles de sécurité.
Cela évite qu'un bouton apparaisse alors que le backend refuse l'action,
ou l'inverse.

## Données existantes

Si des feuilles `SERVICE_MANAGER` sont déjà en `PARTIALLY_APPROVED` parce
qu'elles avaient reçu l'ancienne validation Direction mais attendaient encore
le RH, elles doivent être normalisées une fois vers `APPROVED`.

Ne faites pas cette migration automatiquement en lecture : elle doit être
faite de manière contrôlée après sauvegarde de la base.

## Vérification recommandée

```powershell
npm run typecheck
npm run build
```

Puis tester au minimum ces comptes :

1. AGENT ;
2. SERVICE_MANAGER ;
3. DIRECTION ;
4. RH_MANAGER ;
5. TENANT_ADMIN.

Scénario prioritaire :

```text
Chef de service crée
→ lui seul modifie
→ lui seul soumet
→ Direction valide
→ feuille APPROVED immédiatement
→ Chef de service renseigne KPI
→ Direction valide ou demande discussion
→ RH peut lire/télécharger mais ne peut rien modifier
```
