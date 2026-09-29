## Ordre après correction pour l'àncer àdministràteur 
npm run seed:fades -w @fades/api
npm run seed:fades-admin -w @fades/api
npm run dev:api
 



## Pour verifier s'il n'y à pàs derreur dàns le projet  
$ npm run typecheck -w @fades/api

> @fades/api@0.1.0 typecheck   
> tsc -p tsconfig.json --noEmit
Parfait. Là, le résultat est bon : **TypeScript n’affiche plus aucune erreur**.

Ton backend API passe maintenant le contrôle :

```txt
tsc -p tsconfig.json --noEmit
```

Donc les fichiers corrigés sont bien compatibles.

Tu peux maintenant relancer proprement :

```powershell
npm run dev:api
```

Puis, dans un autre terminal :

```powershell
npm run dev:web
```

Oui, c’est **normal** dans ton backend TypeScript.

Tu codes tes fichiers en :

```txt
.ts
```

mais dans les imports tu vois :

```ts
import { UserModel } from "../users/user.model.js";
```

au lieu de :

```ts
import { UserModel } from "../users/user.model.ts";
```

C’est volontaire et même recommandé dans ton cas.

## Pourquoi ?

Ton backend utilise probablement le mode **ES Modules** avec Node.js, c’est-à-dire :

```json
"type": "module"
```

Dans ce mode, quand TypeScript compile ton fichier :

```txt
auth.service.ts
```

il devient :

```txt
auth.service.js
```

Donc l’import doit déjà viser le fichier JavaScript final :

```ts
import { UserModel } from "../users/user.model.js";
```

Même si le fichier source réel est :

```txt
user.model.ts
```

TypeScript comprend que l’import `.js` correspond au fichier `.ts` pendant le développement.

## Donc il ne faut pas remplacer par `.ts`

Évite ceci :

```ts
import { UserModel } from "../users/user.model.ts";
```

Sauf configuration spéciale, cela peut créer des erreurs au build ou au runtime Node.

## La bonne règle pour ton projet

Garde cette logique :

```ts
// Bon
import { UserModel } from "../users/user.model.js";
import { AppError } from "../../core/errors/app-error.js";
import type { TenantDocument } from "../tenants/tenant.types.js";
```

Même dans les fichiers `.ts`.

## Pourquoi c’est important ?

Parce qu’après compilation, Node exécutera les fichiers `.js`. Si tes imports n’ont pas l’extension `.js`, Node peut échouer avec une erreur du type :

```txt
ERR_MODULE_NOT_FOUND
```

## Conclusion

Dans ton projet FADES-RH, c’est parfaitement normal :

```txt
Fichier écrit : .ts
Import utilisé : .js
Fichier exécuté après build : .js
```

Donc tu dois continuer comme ça. C’est la bonne pratique pour un backend TypeScript en ES Modules.



 ## Fondation technique terminée
- Monorepo npm workspaces
- Frontend React + Vite + TypeScript
- Backend Express + TypeScript
- MongoDB Atlas connecté
- Multi-tenant avec tenant initial FADES
- Authentification JWT via cookies sécurisés
- Refresh session et déconnexion
- Rôles et permissions
- Interface Login responsive
- Dashboard responsive avec sidebar FADES et logo SVG

 
### Organisation interne
- Directions
- Services
- Hiérarchie Direction → Service
- Responsables de structure
- Isolation par tenant

## Modules à venir
1. Agents et dossiers RH
2. Tâches
3. Pointages
4. Congés et absences
5. Cahiers de route
6. Évaluations semestrielles
7. Alertes, rapports et audit
8. Administration SaaS avancée

## Règles permanentes
- Toute donnée métier porte un `tenantId`.
- Aucune donnée ne doit traverser les tenants.
- Toute page doit être responsive : mobile, tablette et ordinateur.
- Toute action sensible doit respecter les rôles et permissions.
- Ne jamais mettre de secrets dans le frontend.
- Ne pas casser les modules déjà validés.

### Organisation interne — Backend et interface
- Modèle multi-tenant Direction / Service
- Arborescence Direction → Service
- Création et modification sécurisées
- Contrôle des rôles et permissions
- Interface Structure FADES responsive
- Création de Direction et Service depuis le dashboard

Tu dois pouvoir :

Développer une Direction ;
Créer un nouveau Service ;
Modifier une structure ;
Activer ou désactiver un Service ;
Utiliser la page sur téléphone, tablette et ordinateur.

### Agents — Backend
- Modèle Agent multi-tenant
- Matricule unique par organisation
- Rattachement Direction et Service
- Statut administratif et contrat
- Supérieur hiérarchique
- Lien optionnel avec compte utilisateur
- Historique administratif
- Préparation documents RH
- Routes sécurisées par permissions
- Statistiques agents

### Agents — Frontend
- Liste des agents connectée aux vraies données backend
- Recherche, filtres et pagination
- Statistiques RH réelles
- Création et modification d’un dossier agent
- Rattachement Direction / Service
- Sélection du supérieur hiérarchique
- Détails complets dans un drawer responsive
- Historique administratif avec ajout d’événements
- Interface responsive téléphone, tablette et ordinateur

### Documents RH sécurisés — Backend
- Sous-module indépendant des dossiers Agents
- Stockage privé Cloudinary
- Fichiers RH isolés par tenant et par agent
- Téléchargement via URL signée temporaire
- Contrôle d’accès via permissions AGENT_VIEW et AGENT_MANAGE
- Formats autorisés : PDF, image, Word et Excel
- Limite de taille : 10 Mo
- Archivage logique sans suppression immédiate des preuves

La prochaine étape sera l’interface frontend Documents RH : sélection de fichier, dépôt sécurisé, liste des pièces, téléchargement, archivage et affichage des échéances directement dans le drawer Agent.

### Documents RH sécurisés — Frontend

- Dépôt de documents dans le dossier Agent
- Envoi multipart avec fichier, catégorie, titre et échéance
- Consultation de la liste des documents actifs
- Téléchargement sécurisé par route backend authentifiée
- Archivage logique avec confirmation
- Indicateurs d’échéance : valide, proche expiration, expiré
- Interface responsive dans le drawer Agent

Ouvre http://localhost:5173/agents
Clique sur Voir pour un agent.
Dans Documents RH sécurisés, clique sur Ajouter.
Choisis un PDF ou une image.
Saisis le titre, la catégorie et une échéance éventuelle.
Enregistre.
Teste le téléchargement et l’archivage.

Après validation, nous passerons au module Tâches, basé sur les Agents, la structure Direction/Service et la hiérarchie déjà créées.

Clique sur l’œil : aperçu dans la modale FADES-RH.
Vérifie que le navigateur ne redirige jamais vers Cloudinary.
Télécharge : le fichier arrive directement, sans onglet Cloudinary.
Archive un document.
Ouvre l’onglet Archives.
Restaure-le.
Recherche par titre ou nom du fichier.
Filtre les documents expirés ou proches de l’échéance.

La suppression définitive n’est volontairement pas exposée dans l’interface : l’archivage protège les preuves administratives et permet une restauration contrôlée.

✅ Authentification et rôles
✅ Tenant FADES
✅ Dashboard responsive
✅ Directions et Services
✅ Dossiers Agents
✅ Historique administratif
✅ Documents RH privés
✅ Recherche, filtres, archivage et restauration
✅ Téléchargement et aperçu sans exposition de Cloudinary

Nous allons maintenant construire le module Tâches, dans cet ordre :

1. Backend Tâches
   - création, attribution et priorités
   - échéances, statuts et progression
   - rattachement Agent / Direction / Service
   - commentaires et historique
   - permissions selon le rôle
TENANT_ADMIN / RH_MANAGER
→ toutes les tâches du tenant

DIRECTION
→ uniquement les tâches de sa Direction

SERVICE_MANAGER
→ uniquement les tâches de son Service

AGENT
→ uniquement les tâches qui lui sont attribuées
2. Interface Tâches
   - tableau Kanban
   - liste et filtres avancés
   - création et suivi en drawer
   - alertes d’échéance
   - responsive téléphone, tablette et ordinateur

3. Ensuite
   - Pointage
   - Congés et absences
   - Cahiers de route
   - Évaluations
   - Rapports et alertes RH

   ### Tâches — Backend et Frontend

- Tâches multi-tenant avec référence automatique
- Attribution à un agent responsable
- Priorités, statuts, échéances et progression
- Restriction par rôle, Direction et Service
- Tableau Kanban responsive
- Vue liste avec recherche et filtres
- Commentaires de suivi
- Historique automatique des actions
- Statistiques opérationnelles
- Mise à jour de progression par l’agent responsable

Ordre de test conseillé :

Créer une tâche avec un agent responsable.
Vérifier sa présence dans le Kanban.
Ouvrir la tâche.
Ajouter un commentaire.
Mettre la progression à 25 %, puis 100 %.
Vérifier que le statut passe automatiquement à “Terminée” à 100 %.
Tester les filtres Direction, Service, Responsable et échéance.
Tester un compte Agent : il ne doit voir que ses propres tâches.z

1. Agent : arrivée via /check-in
2. Même agent : seconde arrivée refusée
3. Agent : départ via /check-out
4. Responsable RH : création d’un pointage manuel
5. Responsable RH : correction d’une heure d’arrivée
6. Agent : tentative de correction administrative refusée
7. Direction : accès uniquement à ses agents
8. Service Manager : accès uniquement à son Service

### Pointage et présence — Backend et Frontend

- Pointage personnel arrivée et départ
- Horloge Conakry en direct
- Calcul des retards, heures travaillées et heures supplémentaires
- Gestion de présence par statut
- Pointage manuel réservé aux responsables autorisés
- Correction administrative tracée
- Historique détaillé des actions
- Registre filtrable par période, statut, Direction, Service et Agent
- Statistiques RH et indicateurs de présence
- Interface responsive téléphone, tablette et ordinateur

1. Agent : arrivée personnelle.
2. Agent : départ personnel.
3. Vérification du calcul de durée et de retard.
4. Responsable RH : pointage manuel.
5. Responsable RH : correction d’un pointage existant.
6. Consultation de l’historique.
7. Filtres par date, statut, Direction, Service et Agent.
8. Test mobile et tablette.

1. Utilisateurs et sécurité des accès
2. Pointage & Présence
3. Congés et absences
4. Cahiers de route
5. Évaluations et rapports RH

✓ Création d’un compte utilisateur lié ou non à un Agent
✓ Attribution contrôlée des rôles
✓ Activation, désactivation et verrouillage de compte
✓ Réinitialisation sécurisée du mot de passe
✓ Vérification d’adresse e-mail
✓ Consultation des dernières connexions
✓ Gestion des sessions actives et déconnexion forcée
✓ Recherche, filtres, pagination et statistiques
✓ Journalisation des actions d’administration
✓ Empêchement de la suppression ou désactivation du dernier administrateur
✓ Séparation stricte entre identité Utilisateur et dossier RH Agent

Utilisateur = accès à FADES-RH, e-mail, mot de passe, rôle, sessions.
Agent = dossier professionnel RH, poste, Direction, Service, contrat.

Un Agent peut exister sans compte utilisateur. En revanche, un compte utilisateur lié à un Agent doit rester cohérent avec son statut RH et son tenant.

Parfait. Avant de modifier les utilisateurs, il faut s’aligner sur ton authentification existante afin de ne pas casser les cookies JWT, les rôles ni les sessions déjà fonctionnelles.

Colle ici ces fichiers backend :

```txt
1. apps/api/src/modules/users/user.model.ts
   ou le fichier contenant UserModel / UserSchema

2. apps/api/src/modules/auth/auth.controller.ts
3. apps/api/src/modules/auth/auth.service.ts
4. apps/api/src/modules/auth/auth.routes.ts

5. apps/api/src/middlewares/auth.middleware.ts

6. Le fichier des rôles et permissions
   celui où tu as ajouté TASK_* et ATTENDANCE_*

7. apps/api/src/modules/agents/agent.model.ts
```

Je te donnerai ensuite les fichiers prêts à copier-coller pour :

```txt
✓ Liste paginée des utilisateurs
✓ Recherche par nom, e-mail, rôle et statut
✓ Création sécurisée de compte
✓ Liaison avec un Agent existant
✓ Modification contrôlée du rôle
✓ Activation et désactivation
✓ Protection du dernier administrateur actif
✓ Réinitialisation de mot de passe
✓ Déconnexion forcée de toutes les sessions
✓ Statistiques administratives
✓ Historique des actions sensibles
✓ Interface Utilisateurs premium et responsive
```
TENANT_ADMIN : contrôle total du tenant.

RH_MANAGER : gère les comptes Agents, sans pouvoir créer
ou désactiver un administrateur du tenant.

DIRECTION / SERVICE_MANAGER : gèrent leurs équipes
selon leur périmètre métier.

AGENT : consulte, pointe, commente et met à jour
la progression de ses propres tâches.

test à fàire 

1. Créer un Agent sans compte utilisateur.
2. Créer un compte et le rattacher à cet Agent.
3. Se connecter avec le nouveau compte.
4. Vérifier que mustChangePassword vaut true.
5. Modifier le rôle et la liaison Agent.
6. Désactiver le compte puis vérifier que la session est bloquée.
7. Réactiver le compte.
8. Réinitialiser le mot de passe temporaire.
9. Fermer les sessions actives d’un utilisateur.
10. Tenter de désactiver le dernier TENANT_ADMIN.

1. Créer un Agent sans compte utilisateur.
2. Créer un compte et le rattacher à cet Agent.
3. Se connecter avec le nouveau compte.
4. Vérifier que mustChangePassword vaut true.
5. Modifier le rôle et la liaison Agent.
6. Désactiver le compte puis vérifier que la session est bloquée.
7. Réactiver le compte.
8. Réinitialiser le mot de passe temporaire.
9. Fermer les sessions actives d’un utilisateur.
10. Tenter de désactiver le dernier TENANT_ADMIN.


### Utilisateurs et sécurité des accès — Frontend

- Tableau de bord utilisateurs avec statistiques
- Recherche, filtres et pagination
- Création et modification de comptes
- Liaison sécurisée Utilisateur / Agent
- Attribution de rôles selon le profil connecté
- Activation et désactivation de comptes
- Réinitialisation du mot de passe temporaire
- Vérification administrative des e-mails
- Consultation des sessions actives
- Déconnexion forcée des sessions
- Historique administratif complet
- Interface responsive téléphone, tablette et ordinateur

AGENT
- Voit uniquement son pointage personnel.
- Pointe son arrivée puis son départ.
- Ne peut pas créer ni corriger un pointage manuel.

SERVICE_MANAGER
- Consulte les présences de son Service.
- Peut créer et corriger un pointage dans son périmètre.

DIRECTION
- Consulte et gère les présences de sa Direction.

RH_MANAGER / TENANT_ADMIN
- Accès complet aux statistiques, filtres, corrections,
  pointages manuels, historique et sessions de contrôle.AGENT
- Voit uniquement son pointage personnel.
- Pointe son arrivée puis son départ.
- Ne peut pas créer ni corriger un pointage manuel.

SERVICE_MANAGER
- Consulte les présences de son Service.
- Peut créer et corriger un pointage dans son périmètre.

DIRECTION
- Consulte et gère les présences de sa Direction.

RH_MANAGER / TENANT_ADMIN
- Accès complet aux statistiques, filtres, corrections,
  pointages manuels, historique et sessions de contrôle.

### Conge 
Le **solde** représente le nombre de jours de congé qu’un Agent peut encore utiliser pour une année donnée et pour un type de congé donné.

Dans FADES-RH, il sert surtout à éviter qu’un Agent prenne plus de jours que ceux auxquels il a droit, tout en gardant une traçabilité claire des décisions RH.

### Exemple simple

Un Agent dispose, pour l’année 2026, de :

```txt
Droit annuel :                 26 jours
Report de l’année précédente :  4 jours
Ajustement RH :                2 jours
Congés déjà consommés :        10 jours
------------------------------------------------
Solde disponible :             22 jours
```

La formule est :

```txt
Solde disponible =
Solde d’ouverture
+ Jours acquis
+ Jours reportés
+ Ajustements RH
- Jours consommés
```

Dans le module, cela correspond à :

```txt
openingDays      = solde initial éventuellement attribué
entitledDays     = nombre de jours de congé accordés pour l’année
carriedOverDays  = jours non utilisés reportés de l’année précédente
adjustmentDays   = correction positive ou négative faite par la RH
consumedDays     = jours réellement déduits après approbation
availableDays    = solde restant disponible
```

### Pourquoi le solde est important

Sans solde, le système peut seulement enregistrer qu’un Agent demande une absence. Il ne peut pas savoir s’il reste réellement des jours de congé disponibles.

Le solde permet donc de :

```txt
✓ vérifier qu’une demande est possible avant validation ;
✓ empêcher les dépassements de droits ;
✓ distinguer les congés payés des absences non rémunérées ;
✓ gérer les reports d’une année sur l’autre ;
✓ corriger une situation particulière par décision RH ;
✓ produire des rapports RH fiables ;
✓ justifier précisément toute déduction ou restitution de jours.
```

### Le fonctionnement dans FADES-RH

Lorsqu’un Agent formule une demande de congé annuel :

```txt
1. Le système calcule le nombre de jours demandés.

2. Il vérifie le solde disponible de l’Agent.

3. La demande est soumise au responsable hiérarchique.

4. Après validation finale RH, les jours sont déduits du solde.

5. Si la demande est annulée avant ou après validation,
   les jours peuvent être restitués.
```

### Tous les types d’absence ne doivent pas nécessairement réduire le solde

C’est un point essentiel.

```txt
Congé annuel :
→ réduit normalement le solde annuel.

Congé sans solde :
→ ne réduit pas le congé annuel ;
→ il est enregistré comme absence non rémunérée.

Congé maladie :
→ peut être traité séparément selon les règles internes
  et les pièces justificatives.

Congé maternité / paternité :
→ peut relever d’un régime spécifique ;
→ il ne doit pas automatiquement réduire le congé annuel.

Mission, formation, télétravail :
→ ne sont généralement pas des congés ;
→ ils ne doivent pas réduire le solde.
```

Ainsi, le solde n’est pas une simple information affichée. C’est le mécanisme qui permet à la RH de contrôler les droits de chaque Agent de manière juste, transparente et vérifiable.


**Cahiers de route / Missions terrain**.

Sa fonction principale est la planification annuelle individuelle : chaque Agent définit ses objectifs SMART, ses indicateurs, ses actions pondérées, ses jalons trimestriels, ses risques et ses besoins. Les missions terrain deviennent une **catégorie d'action** (`FIELD_MISSION`) et non plus la structure principale du module.

## 1. Contenu livré

### Backend

Copier le dossier :

```txt
apps/api/src/modules/roadmaps/
```

Il contient :

- feuille de route annuelle par Agent et par année ;
- référence automatique `FDR-AAAA-0001` ;
- objectifs SMART pondérés à 100 % ;
- indicateurs / résultats clés avec progression calculée ;
- actions trimestrielles et jalons ;
- soumission, validation hiérarchique, décision finale, révision et annulation ;
- mise à jour de progression des indicateurs et actions ;
- points de suivi, alertes et besoins d'appui ;
- preuves structurées ;
- évaluation finale sans double saisie ;
- périmètres Agent, Service, Direction, RH et Administrateur ;
- journal de traçabilité.

### Frontend

Copier les dossiers :

```txt
apps/web/src/features/roadmaps/
apps/web/src/pages/roadmaps/
```

L'interface comprend :

- tableau de bord des plans annuels ;
- filtres, recherche, pagination et indicateurs ;
- assistant de création en six étapes ;
- contrôle visible de la pondération à 100 % ;
- gestion dynamique des objectifs, indicateurs, actions et jalons ;
- drawer détaillé avec progression, points de suivi, preuves, évaluation et historique ;
- affichage responsive téléphone, tablette et ordinateur.
## 6. Important sur les preuves

Le module gère les preuves comme des enregistrements structurés : titre, type, description, date et lien facultatif.

Il n'active pas un nouveau stockage Cloudinary générique afin de ne pas exposer de liens sensibles ni dupliquer ton module sécurisé de documents. Lors de l'étape suivante, le champ `externalUrl` pourra être remplacé par une référence interne vers le module de documents sécurisés déjà utilisé par FADES-RH.


Scénario de validation recommandé :

1. Créer le plan annuel d'un Agent ;
2. Ajouter des objectifs dont le total des poids est égal à 100 % ;
3. Ajouter indicateurs, actions et jalons ;
4. Sauvegarder le brouillon ;
5. Soumettre le plan ;
6. Réaliser une validation hiérarchique ;
7. Approuver définitivement par Direction ou RH ;
8. Mettre à jour les indicateurs et actions ;
9. Ajouter un point de suivi et une preuve ;
10. Réaliser l'évaluation finale.


- un Agent voit et gère uniquement son plan ;
- un Responsable de service agit uniquement dans son service ;
- la Direction agit uniquement dans sa direction ;
- RH et Administrateur ont une vue globale du tenant.
Dans le cahier de route, **le propriétaire** signifie : **la personne à qui appartient la feuille de route**, c’est-à-dire l’Agent, le Chef de service, la Direction ou le RH qui a créé sa propre feuille annuelle.

Quand le propriétaire clique sur **“Marquer réalisée”**, cela ne veut pas dire qu’il valide juridiquement ou hiérarchiquement sa propre action. Cela signifie simplement :

```txt
Je déclare que cette ligne de ma feuille de route est exécutée.
Je renseigne un commentaire de réalisation.
Je peux joindre une preuve KPI.
La ligne passe de “À réaliser” à “Réalisée”.
Le KPI passe ensuite en attente de contrôle.
```

Techniquement, ton backend fait exactement cela : il met la ligne en `DONE`, renseigne la date de réalisation, le commentaire KPI, le fichier éventuel, verrouille le KPI et le place en `PENDING_REVIEW`. 

Donc il faut distinguer trois actions :

```txt
1. Marquer réalisée
= déclaration ou enregistrement de l’exécution de l’action.

2. Valider KPI
= contrôle de la preuve ou du commentaire de réalisation.

3. Valider la feuille de route
= validation hiérarchique ou RH de la feuille entière.
```

Pour une meilleure UX, je te conseille de changer légèrement les libellés selon le rôle :

```txt
Pour le propriétaire :
“Déclarer réalisée”

Pour le responsable hiérarchique :
“Marquer réalisée pour l’agent”
ou
“Enregistrer la réalisation”

Pour la RH :
“Régulariser / enregistrer comme réalisée”
```

Cela évite la confusion entre **réaliser une action** et **valider une action**.

Dans ta logique métier, le plus propre est donc :

```txt
Le propriétaire peut déclarer sa propre réalisation.
Le responsable hiérarchique peut enregistrer ou corriger une réalisation dans son périmètre.
La RH peut faire la même chose en supervision.
Mais la validation KPI reste une action distincte.
```

Donc, en résumé : **“Marquer réalisée” veut dire constater ou déclarer que l’action est exécutée, avec commentaire/preuve. Ce n’est pas une validation hiérarchique.**


Oui, **c’est normal uniquement si on comprend ce bouton comme une action de réalisation / régularisation**, et non comme une validation.

Mais pour éviter la confusion, **il ne faut pas que tous voient exactement le même libellé “Marquer réalisée”**.

La meilleure logique UX est celle-ci :

```txt
Propriétaire de la feuille
→ Déclarer réalisée
```

Cela signifie : *j’indique que mon action est exécutée, avec commentaire ou preuve.*

```txt
Responsable hiérarchique / Direction
→ Enregistrer la réalisation
```

Cela signifie : *je constate ou régularise la réalisation d’un Agent ou Chef de service de mon périmètre.*

```txt
RH / Admin
→ Régulariser comme réalisée
```

Cela signifie : *je corrige ou complète en supervision RH.*

```txt
Chef de service
→ Enregistrer la réalisation
```

Mais uniquement pour les **Agents de son service**. Pour sa propre feuille de route, il doit voir plutôt **“Déclarer réalisée”**, car il agit comme propriétaire.

Donc, en résumé :

```txt
Oui, le bouton peut exister pour :
- le propriétaire ;
- le responsable hiérarchique ;
- la Direction ;
- la RH ;
- l’Admin.

Mais le libellé doit changer selon le rôle.
```

Et surtout, ce bouton ne doit pas remplacer :

```txt
Valider KPI
```

Car **“Déclarer / Enregistrer réalisée”** veut dire : l’action est exécutée.

Alors que **“Valider KPI”** veut dire : le responsable ou la RH contrôle et accepte la preuve ou le résultat.

La structure correcte est donc :

```txt

1. Déclarer / Enregistrer la réalisation
2. Contrôler le KPI
3. Valider la feuille de route

```

Dans ton module, je recommande donc de garder cette fonctionnalité, mais de remplacer le texte visible du bouton selon le rôle pour éviter toute confusion.

___________________________________

Agent
→ pointe uniquement pour lui-même ;
→ voit uniquement ses propres pointages.

Chef de service
→ pointe uniquement pour lui-même ;
→ voit ses propres pointages ;
→ voit les pointages des agents de son service ;
→ ne crée pas de pointage manuel pour autrui ;
→ ne corrige pas ;
→ ne supprime pas.

Direction
→ pointe uniquement pour elle-même ;
→ voit tous les pointages de sa Direction : chefs de service + agents ;
→ ne crée pas de pointage manuel pour autrui ;
→ ne corrige pas ;
→ ne supprime pas.

RH
→ pointe pour elle-même ;
→ crée un pointage manuel ;
→ voit tout le registre ;
→ filtre par Direction, Service, Agent et période.

Administrateur
→ voit tout le registre comme la RH ;
→ crée un pointage manuel ;
→ corrige ;
→ supprime définitivement.


-----------------------------------------------
Du 01/01/2025 au 02/10/2026
→ aucune alerte n’est envoyée ;
→ le dossier Agent fonctionne normalement.

À partir du 03/10/2026
→ le système détecte que la fin du contrat est proche ;
→ il prépare une alerte de fin de contrat.

Destinataires
→ l’Agent concerné reçoit un email ;
→ les RH reçoivent aussi un email.

Objet de l’email
→ informer que le contrat arrive bientôt à échéance ;
→ rappeler la date de fin éventuelle ;
→ inviter RH et Agent à anticiper : renouvellement, avenant, sortie, régularisation ou décision administrative.

Après envoi
→ le module inscrit un événement dans l’historique administratif de l’Agent ;
→ l’alerte n’est pas renvoyée tous les jours pour la même date ;
→ cela évite les doublons et les emails répétitifs.

# FADES-RH — Documentation technique et fonctionnelle du module Évaluations

**Version documentée :** 2.0 — Rattachement organisationnel, intégration Congés, moteur HRS et impression A4 avec logo  
**Date :** 24 juillet 2026  
**Périmètre :** backend Express/Mongoose TypeScript et frontend React/Vite TypeScript

## 1. Objet du module

Le module Évaluations centralise l’évaluation professionnelle annuelle ou périodique des Agents FADES. Il rapproche les données provenant des modules Agents, Organisation, Tâches, Feuilles de route, Pointage et Congés, puis les complète par l’auto-évaluation, l’appréciation hiérarchique et la validation RH.

Le moteur HRS est un moteur expert déterministe : il applique des règles de calcul et d’interprétation documentées. Il ne remplace ni l’entretien contradictoire, ni l’appréciation du responsable, ni la décision RH finale.

## 2. Résultats fonctionnels

- Création et mise à jour d’une fiche d’évaluation par la RH ou l’administrateur.
- Snapshot historique de l’identité de l’Agent et de son rattachement Direction/Service.
- Consolidation automatique des tâches, feuilles de route, pointages, congés et soldes annuels.
- Grille de huit critères pondérés sur 100.
- Hiérarchie des notes : RH, puis hiérarchie, puis Agent, puis suggestion système.
- Auto-évaluation, appréciation hiérarchique et validation RH.
- Synthèse exécutive, brief RH, note prête pour Direction générale, alertes et plan à 90 jours.
- Export CSV, impression A4/PDF et téléchargement HTML.
- Logo `logo-fadestext.avif` visible uniquement dans le document imprimable/téléchargeable.

## 3. Architecture

### Backend

`backend/src/modules/evaluations/`

- `evaluation.access.ts` : acteur, périmètre et autorisations métier.
- `evaluation.controller.ts` : adaptation HTTP et validation du contexte.
- `evaluation.model.ts` : schémas Mongoose et index.
- `evaluation.routes.ts` : routes Express protégées.
- `evaluation.schema.ts` : schémas Zod des entrées.
- `evaluation.service.ts` : consolidation, calculs, intelligence HRS, CRUD et export.
- `evaluation.types.ts` : types métier, publics et documentaires.

### Frontend

- `src/features/evaluations/evaluation.api.ts` : appels HTTP.
- `src/features/evaluations/evaluation.types.ts` : contrats TypeScript.
- `src/pages/evaluations/EvaluationsPage.tsx` : registre, indicateurs, filtres et actions.
- `src/pages/evaluations/EvaluationFormModal.tsx` : création/modification.
- `src/pages/evaluations/EvaluationDetailsDrawer.tsx` : synthèse, revues, impression et export.
- `src/pages/evaluations/evaluation-page.css` : charte responsive et A4.

## 4. Dépendances métier

Le module lit les collections ou modèles suivants :

- `AgentModel` : identité, contrat, poste, Direction et Service.
- `OrganizationUnitModel` : nom, type et parent des unités organisationnelles.
- `UserModel` : utilisateur lié à l’Agent et résolution des responsables.
- `TaskModel` : tâches affectées et progression.
- `RoadmapModel` : feuille de route annuelle et éléments réalisés.
- `AttendanceModel` : jours marqués, retards, absences, minutes travaillées et supplémentaires.
- `LeaveRequestModel` : demandes et décisions de congé.
- `LeaveBalanceModel` : solde annuel du congé annuel.

## 5. Rôles et droits

| Action | TENANT_ADMIN | RH_MANAGER | DIRECTION | SERVICE_MANAGER | AGENT |
|---|---:|---:|---:|---:|---:|
| Consulter selon périmètre | Oui, global | Oui, global | Sa Direction | Son Service | Sa fiche |
| Créer une évaluation | Oui | Oui | Non | Non | Non |
| Modifier la fiche | Oui | Oui | Non | Non | Non |
| Renseigner l’auto-évaluation | Oui | Oui | Non sauf propre fiche | Non sauf propre fiche | Oui, propre fiche |
| Appréciation hiérarchique | Oui | Oui | Sa Direction | Son Service | Non |
| Validation RH | Oui | Oui | Non | Non | Non |
| Recalcul HRS | Oui | Oui | Non | Non | Non |
| Suppression | Oui | Oui | Non | Non | Non |
| Export/statistiques | Selon périmètre | Selon périmètre | Selon périmètre | Selon périmètre | Selon périmètre |

## 6. Cycle de vie

- `DRAFT` : fiche créée, en préparation.
- `SELF_REVIEWED` : auto-évaluation enregistrée.
- `MANAGER_REVIEWED` : appréciation hiérarchique enregistrée.
- `HR_VALIDATED` : décision RH finalisée.
- `ARCHIVED` : fiche conservée hors cycle actif.

Le flux recommandé est : création → auto-évaluation → appréciation hiérarchique → validation RH → archivage éventuel.

## 7. Rattachement Direction/Service

À la création, le service construit un snapshot de l’Agent. La résolution accepte un identifiant MongoDB, une chaîne ou un objet peuplé. Si le Service est disponible mais que la Direction est absente, le service remonte automatiquement vers `parentId`. Il répare également les anciennes fiches dans lesquelles un Service avait été enregistré comme Direction.

Une nouvelle fiche est refusée si la Direction ne peut pas être résolue dans l’organisation FADES. À l’ouverture et lors du recalcul, l’identité et les libellés organisationnels sont rafraîchis, puis sauvegardés.

## 8. Sources et snapshot de performance

Le snapshot conserve notamment :

- tâches totales, terminées, non terminées, en cours, bloquées et échues ;
- taux de réalisation et progression moyenne ;
- jours ouvrés évaluables, jours marqués, présences, retards et absences non couvertes ;
- minutes de retard, travaillées et supplémentaires ;
- progression, statut et éléments de la feuille de route ;
- demandes de congé par statut, jours demandés/approuvés/refusés/annulés/en validation ;
- ventilation par type de congé ;
- solde annuel configuré, droits, report, ajustement, consommation et disponible ;
- sources et résumé automatique ;
- date de génération.

La période est arrêtée à la date du jour lorsqu’elle se termine dans le futur, afin de ne pas transformer les jours futurs en absences.

## 9. Traitement des congés et de l’assiduité

Statuts reconnus : `DRAFT`, `SUBMITTED`, `MANAGER_APPROVED`, `APPROVED`, `REJECTED`, `CANCELLED`.

Les statuts `SUBMITTED` et `MANAGER_APPROVED` sont considérés comme en validation. Seul `APPROVED` couvre les jours ouvrés et neutralise l’absence correspondante. Les congés approuvés sont toujours présentés séparément et ne sont jamais assimilés à des absences injustifiées.

Les demi-journées ou durées fractionnaires sont préservées par une couverture quotidienne proportionnelle. Les samedis et dimanches sont exclus.

## 10. Critères et pondération

| Critère | Poids | Base automatique principale |
|---|---:|---|
| Réalisation des objectifs et résultats | 25 % | 60 % tâches + 40 % feuille de route lorsqu’elle existe |
| Qualité du travail et fiabilité | 15 % | progression moyenne et niveau d’objectifs |
| Compétences techniques | 10 % | indicateur d’exécution, à confirmer humainement |
| Discipline et assiduité | 10 % | présence corrigée des congés, pénalité de retard |
| Initiative et autonomie | 10 % | résultats et progression documentée |
| Collaboration et esprit d’équipe | 10 % | disponibilité et contribution collective, indicatives |
| Communication et reporting | 10 % | traçabilité des tâches et livrables |
| Valeurs et mission FADES | 10 % | assiduité, résultats et régularité |

La somme des poids est de 100 %. Les heures supplémentaires ne majorent pas automatiquement la note : elles sont traitées comme un signal de charge, de priorisation ou de capacité.

## 11. Calcul du score final

Pour chaque critère, la note retenue suit l’ordre :

1. note RH ;
2. note du responsable hiérarchique ;
3. note de l’Agent ;
4. suggestion système.

La note sur 5 est convertie selon son poids. Le score final est la somme pondérée sur 100.

Niveaux :

- 90 à 100 : `EXCELLENT` ;
- 80 à 89 : `VERY_GOOD` ;
- 70 à 79 : `SATISFACTORY` ;
- 60 à 69 : `NEEDS_IMPROVEMENT` ;
- moins de 60 : `INSUFFICIENT`.

## 12. Moteur HRS

Le moteur calcule : indice d’objectifs, indice d’assiduité, fiabilité, constance, confiance des données, niveau de risque, potentiel et décision recommandée.

La confiance dépend de la disponibilité des tâches, feuille de route, jours ouvrés, pointage, congés, auto-évaluation et appréciation hiérarchique.

La note Direction générale est structurée en : appréciation globale, résultats et alignement, discipline/disponibilité/charge, risques et arbitrages, décision proposée.

Les décisions possibles sont : confirmation, renouvellement recommandé, promotion, formation, plan d’amélioration, mobilité ou aucune décision.

## 13. API

Base recommandée : `/api/v1/evaluations`. Le client frontend appelle `/evaluations` en supposant que la configuration Axios contient déjà `/api/v1`.

| Méthode | Route | Usage |
|---|---|---|
| GET | `/stats` | Indicateurs selon périmètre |
| GET | `/export.csv` | Export CSV filtré |
| GET | `/` | Liste paginée et filtrée |
| POST | `/` | Création |
| GET | `/:id` | Consultation et recalcul automatique |
| PATCH | `/:id` | Mise à jour RH/Admin |
| DELETE | `/:id` | Suppression RH/Admin |
| POST | `/:id/recompute` | Recalcul HRS complet |
| POST | `/:id/self-review` | Auto-évaluation |
| POST | `/:id/manager-review` | Appréciation hiérarchique |
| POST | `/:id/hr-validation` | Validation RH |

Paramètres de liste : `page`, `limit`, `search`, `status`, `evaluationYear`, `agentId`, `directionId`, `serviceId`, `dateFrom`, `dateTo`, `sort`.

## 14. Exemples d’entrées

### Création

```json
{
  "agentId": "64f000000000000000000001",
  "title": "Évaluation annuelle de performance 2026",
  "evaluationYear": 2026,
  "periodStartDate": "2026-01-01",
  "periodEndDate": "2026-12-31",
  "evidenceLinks": [],
  "confidentialNote": "Observation interne RH"
}
```

### Appréciation hiérarchique

```json
{
  "comment": "Appréciation consolidée du responsable.",
  "strengths": "Fiabilité et sens des priorités.",
  "improvementAreas": "Améliorer le reporting hebdomadaire.",
  "trainingNeeds": "Pilotage par les indicateurs.",
  "nextObjectives": "Finaliser les jalons prioritaires du trimestre.",
  "criteria": [
    { "key": "OBJECTIVES_RESULTS", "managerScore": 4.0 }
  ]
}
```

### Validation RH

```json
{
  "finalDecision": "TRAINING_PLAN",
  "finalComment": "Plan ciblé et point de contrôle à 90 jours.",
  "criteria": [
    { "key": "TECHNICAL_SKILLS", "hrScore": 3.5 }
  ]
}
```

## 15. Frontend et expérience utilisateur

La page principale charge l’arbre organisationnel, tous les Agents actifs correspondant aux filtres, les statistiques et la liste paginée. React Query invalide les clés `evaluations` et `evaluation` après chaque mutation.

Le drawer contient les onglets Synthèse, Auto-évaluation, Hiérarchie et Validation RH selon le rôle. Le document imprimable présente l’identité, le rattachement, le score, les briefs, les indicateurs, les congés, la grille, les recommandations, la conclusion et les signatures.

## 16. Impression A4, PDF et logo

Le logo doit être placé dans :

```text
frontend/public/logo-fadestext.avif
```

Le composant utilise `import.meta.env.BASE_URL`, puis un chemin racine de secours. Avant l’impression, le logo est récupéré, converti en URL `data:` et injecté dans un document HTML autonome. Le composant attend le chargement des images avant d’appeler `print()`.

Le logo est masqué dans l’interface et n’apparaît que dans le document imprimé, le PDF ou le HTML téléchargé.

Points de contrôle : nom exact en minuscules, réponse HTTP 200, absence de redirection vers `index.html`, cache navigateur vidé et `BASE_URL` Vite cohérent.

## 17. Installation

### Backend

1. Copier les sept fichiers dans `backend/src/modules/evaluations/`.
2. Enregistrer le routeur :

```ts
app.use("/api/v1/evaluations", evaluationRouter);
```

3. Vérifier les imports des modèles Tâches, Pointage, Roadmaps, Congés, Agents, Users et Organisation.
4. Vérifier le middleware `tenantContextMiddleware` et `requireAuth`.

### Frontend

1. Copier les fichiers de `features/evaluations` et `pages/evaluations`.
2. Ajouter la route de page et l’entrée de navigation selon les rôles autorisés.
3. Placer le logo dans `public`.
4. Vérifier que l’instance `api` pointe vers `/api/v1`.
5. Redémarrer Vite et forcer le rechargement.

## 18. Sécurité et intégrité

- Toute route exige un tenant et une authentification.
- Les permissions fines sont appliquées dans `evaluation.access.ts` et le service.
- Les filtres de périmètre sont appliqués aux listes, statistiques et exports.
- Les données confidentielles restent dans la fiche et ne doivent pas être exposées à un rôle non autorisé.
- Les scores automatiques sont des suggestions ; la trace des notes humaines est conservée.
- La validation finale doit rester précédée d’un entretien et d’une vérification des preuves.

## 19. Tests de recette

- Création d’une fiche pour un Agent rattaché directement à une Direction.
- Création pour un Agent rattaché à un Service, avec remontée de la Direction parente.
- Ouverture d’une ancienne fiche sans `directionName` et réparation du snapshot.
- Contrôle des périmètres Direction, Service et Agent.
- Congé approuvé couvrant une absence : absence neutralisée.
- Congé en validation : alerte, sans neutralisation définitive.
- Période finissant dans le futur : jours futurs exclus.
- Ordre de priorité des notes RH/manager/Agent/système.
- Recalcul HRS après modification d’une tâche, d’un congé ou d’une feuille de route.
- Export CSV avec filtres.
- Impression avec logo visible uniquement dans le document.
- Impression multipage sans chevauchement ni cartes coupées.

## 20. Dépannage

### Direction non renseignée

Vérifier `Agent.directionId`, `Agent.serviceId`, l’unité `OrganizationUnit`, son `type`, son `parentId`, son `tenantId` et son statut. Ouvrir ou recalculer la fiche pour déclencher la réparation.

### Logo absent

Ouvrir directement l’URL générée, par exemple `/logo-fadestext.avif` ou `/<base>/logo-fadestext.avif`. Une réponse HTML indique généralement un fichier absent ou un fallback Vite.

### Chiffres non actualisés

Utiliser « Réanalyser HRS », puis invalider les requêtes React Query. Vérifier que les données sources utilisent le même `tenantId` et le même `agentId`.

### Absences anormalement élevées

Vérifier les dates de pointage, les congés approuvés, le format `YYYY-MM-DD` et la date de fin. Les jours ouvrés sans pointage et sans congé approuvé sont comptés comme non couverts.

## 21. Règles de maintenance

- Ne pas remplacer les statuts de congé par des alias non supportés.
- Conserver les routes `/stats` et `/export.csv` avant `/:id`.
- Préserver l’ordre de priorité des notes.
- Ne pas donner de bonus automatique pour les heures supplémentaires.
- Ne jamais pénaliser un congé définitivement approuvé.
- Conserver la réparation Direction/Service pour les anciennes données.
- Mettre à jour simultanément types backend, modèle Mongoose, sérialisation et types frontend lors de l’ajout d’un indicateur.
- Tester l’impression A4 après toute modification structurelle du drawer ou du CSS.

## 22. Arborescence livrée

```text
fades-rh-evaluation-impression-logo-v2/
├── backend/src/modules/evaluations/
│   ├── evaluation.access.ts
│   ├── evaluation.controller.ts
│   ├── evaluation.model.ts
│   ├── evaluation.routes.ts
│   ├── evaluation.schema.ts
│   ├── evaluation.service.ts
│   └── evaluation.types.ts
├── frontend/src/features/evaluations/
│   ├── evaluation.api.ts
│   └── evaluation.types.ts
├── frontend/src/pages/evaluations/
│   ├── EvaluationDetailsDrawer.tsx
│   ├── EvaluationFormModal.tsx
│   ├── EvaluationsPage.tsx
│   └── evaluation-page.css
├── frontend/public/
│   └── logo-fadestext.avif
└── documentation/
    ├── DOCUMENTATION_MODULE_EVALUATIONS_FADES_RH.docx
    └── DOCUMENTATION_MODULE_EVALUATIONS_FADES_RH.md
```


# Module **Rapports FADES-RH** — Version 1 complète

Le module est conçu comme un véritable **centre de consolidation, de pilotage et de reddition**. Il ne reproduit pas les écrans existants : il transforme les données de toute la plateforme en rapports exploitables par la Direction, la RH et les responsables organisationnels.

Cette logique correspond à la vocation initiale de FADES-RH : réunir les Agents, les Tâches, les Pointages, les Congés, les Feuilles de route et les indicateurs de décision dans un centre de pilotage unique.  Le module intègre également les Évaluations, dont le moteur consolide déjà les résultats opérationnels et RH. 

## 1. Types de rapports

### Rapport mensuel

Document opérationnel destiné au suivi immédiat :

* activité du mois ;
* tâches créées, clôturées, en retard ou bloquées ;
* présence, couverture du pointage et ponctualité ;
* congés approuvés et demandes en attente ;
* alertes administratives ;
* décisions urgentes ;
* priorités du mois suivant.

### Rapport semestriel

Véritable **rapport de mi-année** :

* progression cumulée du premier ou du second semestre ;
* évolution mensuelle des indicateurs ;
* état des feuilles de route ;
* comparaison entre Directions ou Services ;
* analyse des risques ;
* mesures correctives pour le semestre suivant ;
* note prête pour la Direction générale.

### Rapport annuel

Bilan institutionnel complet :

* effectifs et situation administrative ;
* comptes utilisateurs et activité numérique ;
* conformité des dossiers RH ;
* tâches et exécution ;
* pointage, présence et charge de travail ;
* congés et absences autorisées ;
* avancement des feuilles de route annuelles ;
* évaluations et décisions RH ;
* comparaison des unités organisationnelles ;
* acquis, difficultés, recommandations et arbitrages ;
* priorités de l’année suivante.

## 2. Périmètres disponibles

Chaque rapport peut porter sur :

* toute l’institution FADES ;
* une Direction ;
* un Service.

Les règles d’accès sont les suivantes :

| Rôle              | Périmètre                    |
| ----------------- | ---------------------------- |
| `TENANT_ADMIN`    | Tous les rapports            |
| `RH_MANAGER`      | Tous les rapports            |
| `DIRECTION`       | Sa Direction et ses Services |
| `SERVICE_MANAGER` | Son Service uniquement       |
| `AGENT`           | Aucun accès au module        |

La permission `REPORT_VIEW` existe déjà pour l’Administrateur, la Direction et la RH dans la matrice actuelle. Le package contient le correctif permettant de l’ajouter au Chef de service. 

## 3. Modules consolidés

Le rapport exploite automatiquement :

* **Agents** : effectifs actifs, entrées, sorties, contrats et rattachements ;
* **Organisation** : Directions et Services ;
* **Utilisateurs** : comptes actifs, vérification et connexions ;
* **Documents RH** : documents actifs, archivés et expirés ;
* **Tâches** : statuts, priorités, progression et retards ;
* **Pointages** : présence, absences, couverture, retards et temps de travail ;
* **Congés** : demandes, statuts, jours approuvés et jours en validation ;
* **Feuilles de route** : progression, jalons et éléments restant à réaliser ;
* **Évaluations** : scores, niveaux de risque, potentiel et décisions RH.

Les modèles actifs permettent déjà le suivi des métriques de pointage, notamment les retards, les minutes travaillées, les heures supplémentaires et les départs anticipés.  Les congés disposent également d’un historique structuré par Agent, Direction, Service, statut et période. 

## 4. Intelligence décisionnelle

Le moteur produit automatiquement :

* un indice d’exécution ;
* un indice d’assiduité ;
* un indice d’avancement des feuilles de route ;
* un indice des évaluations ;
* un indice de qualité des données ;
* un indice global de performance ;
* un niveau de risque ;
* un niveau de confiance des données ;
* un niveau de gouvernance ;
* les acquis de la période ;
* les alertes ;
* les recommandations ;
* les décisions attendues ;
* les priorités de la prochaine période ;
* une synthèse exécutive ;
* une note complète prête pour la Direction générale.

Les modules sans données suffisantes sont signalés et exclus du calcul concerné : ils ne sont pas automatiquement notés à zéro.

Les congés définitivement approuvés réduisent les journées-agent attendues et ne sont jamais assimilés à des absences injustifiées. Les heures supplémentaires restent un indicateur de charge et d’organisation, sans bonus automatique.

## 5. Comparaison temporelle

Le rapport recherche le dernier document validé ou archivé de même type et de même périmètre.

Il compare notamment :

* l’indice global ;
* le taux de clôture des tâches ;
* le taux de présence ;
* la couverture du pointage ;
* la progression des feuilles de route ;
* le score moyen des évaluations.

Les rapports semestriels et annuels présentent également une évolution mensuelle des principaux indicateurs.

## 6. Workflow documentaire

```text
Génération
   ↓
READY — Prêt pour validation
   ↓
VALIDATED — Rapport validé et figé
   ↓
ARCHIVED — Rapport définitivement archivé
```

Le module conserve un **snapshot historique** des chiffres au moment de la génération.

Un rapport peut être recalculé avant sa diffusion. Le recalcul :

* remplace les anciennes données par les données actuelles ;
* régénère les analyses ;
* retire la validation antérieure ;
* conserve la référence documentaire.

Un rapport archivé devient immuable.

## 7. Document imprimable

La fiche A4 comprend :

* l’en-tête officiel du Ministère et du FADES ;
* le logo institutionnel ;
* la référence ;
* la période ;
* le périmètre ;
* l’indice global ;
* la synthèse exécutive ;
* la comparaison avec le rapport précédent ;
* l’évolution mensuelle ;
* la note Direction générale ;
* les chapitres détaillés par module ;
* l’analyse comparative par unité ;
* les décisions attendues ;
* les réserves méthodologiques ;
* les sources ;
* les signatures ;
* le pied de page confidentiel.

Le document a été testé visuellement sur un exemple semestriel de **trois pages A4**. Le badge de performance, les tableaux, les signatures et le pied de page ont été corrigés pour éviter les déformations ou chevauchements.

## 8. Module complet prêt à copier-coller

[**Télécharger le module Rapports FADES-RH complet**](sandbox:/mnt/data/fades-rh-reports-module-v1.zip)

### Backend

[report.access.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.access.ts)

[report.controller.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.controller.ts)

[report.model.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.model.ts)

[report.routes.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.routes.ts)

[report.schema.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.schema.ts)

[report.service.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.service.ts)

[report.types.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/backend/src/modules/reports/report.types.ts)

### Frontend

[report.api.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/features/reports/report.api.ts)

[report.types.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/features/reports/report.types.ts)

[ReportsPage.tsx](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/pages/reports/ReportsPage.tsx)

[ReportFormModal.tsx](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/pages/reports/ReportFormModal.tsx)

[ReportDetailsDrawer.tsx](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/pages/reports/ReportDetailsDrawer.tsx)

[report-page.css](sandbox:/mnt/data/fades-rh-reports-module-v1/frontend/src/pages/reports/report-page.css)

### Intégration et documentation

[Guide complet d’intégration](sandbox:/mnt/data/fades-rh-reports-module-v1/INTEGRATION_MODULE_RAPPORTS.md)

[Documentation fonctionnelle](sandbox:/mnt/data/fades-rh-reports-module-v1/documentation/README_MODULE_RAPPORTS.md)

[Correctif app.ts](sandbox:/mnt/data/fades-rh-reports-module-v1/integration/app.report.patch.txt)

[Correctif permissions](sandbox:/mnt/data/fades-rh-reports-module-v1/integration/permissions.report.patch.txt)

[Exemple de route frontend](sandbox:/mnt/data/fades-rh-reports-module-v1/integration/frontend-route.report.patch.tsx)

[Exemple de navigation](sandbox:/mnt/data/fades-rh-reports-module-v1/integration/nav.report.patch.ts)

[Rapport de validation technique](sandbox:/mnt/data/fades-rh-reports-module-v1/VALIDATION_MODULE_RAPPORTS.md)

## 9. Intégration essentielle

Dans `app.ts` :

```ts
import { managementReportRouter } from "./modules/reports/report.routes.js";

app.use("/api/v1/reports", managementReportRouter);
```

Cette déclaration suit la convention actuelle des routes FADES-RH sous `/api/v1`. 

Dans `permissions.ts`, ajouter à `SERVICE_MANAGER` :

```ts
"REPORT_VIEW",
```

Le logo officiel est fourni sous :

```text
apps/web/public/brand/fades-letterhead-logo.png
```

Les **14 fichiers TypeScript/TSX** ont passé la vérification de syntaxe avec TypeScript 5.8.3, sans diagnostic. Le build complet devra néanmoins être exécuté dans le monorepo réel après copie, afin de vérifier les chemins d’importation et les versions exactes des dépendances.
