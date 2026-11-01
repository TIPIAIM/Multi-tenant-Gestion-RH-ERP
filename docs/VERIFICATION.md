# Vérifications réalisées et périmètre

## Vérifications automatisées

- 57 vérifications Node exécutées sur les règles et les services TypeScript réellement transpilés : rôles, accès au tenant, étapes, décision finale réservée à l’administrateur, nombre de postes, échéance des offres, planification et bilan, retrait des données, export CSV et état des pop-up.
- 2 scénarios Python sur le script d’intégration : aperçu sans mutation, application et sauvegarde des cinq fichiers, conservation des anciens modules, relance sans duplication, arrêt sans modification lorsqu’une ancre manque.
- Vérification de syntaxe de tous les fichiers `.ts` avec Node.

Commandes :

```bash
node --test tests/recruitment.test.mjs
python tests/integration.test.py
```

Les tests Node utilisent le moteur de suppression des types de Node 24 et des doubles de stockage. Ils ne nécessitent pas d’installer le projet, mais ne remplacent pas un essai sur une vraie base MongoDB.

## À exécuter dans le projet complet

Le dépôt complet et ses dépendances n’étaient pas disponibles. Aucun résultat de compilation TSX, de vérification TypeScript complète, de rendu navigateur ou de test transactionnel réel MongoDB n’est revendiqué. Exécuter les commandes de compilation de votre projet et le parcours local décrit dans INSTALLATION.md avant mise en production.

## Choix d’intégration

- API Express, isolation par locataire et session authentifiée, rôle relu en base.
- Seuls RH_MANAGER et TENANT_ADMIN consultent les dossiers ; DIRECTION n’est pas assimilé à l’administrateur.
- Décision d’embauche finale : TENANT_ADMIN, comme directeur général indiqué dans les échanges.
- Aucune inscription ou lecture publique non authentifiée.
- Index unique pour l’e-mail normalisé par offre et locataire ; index unique de référence d’offre par locataire.
- Mutations sur une offre sérialisées avec révision et transaction ; historique et notifications associés à la transaction.
- Les CV sont référencés par lien HTTPS ; aucun téléchargement automatique serveur ou stockage de CV nouveau n’est ajouté.
- Aucune modification du module Agents, des notifications partagées, des paramètres, des congés, de la paie ou des formations.
