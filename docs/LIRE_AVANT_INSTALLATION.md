# Mise à jour RH — Modules, paie, photos et tâches

Cette archive contient les fichiers complets nouveaux ou modifiés, à copier dans votre projet actuel. Elle est basée sur front.zip et backend.zip transmis le 14 octobre 2026. Aucun fichier .env, secret, stockage utilisateur ou dépendance installée n’est inclus.

## Installation
1. Faites un commit ou une copie de sauvegarde du projet.
2. Copiez apps/web dans votre dossier frontend et apps/api dans votre dossier backend, en remplaçant les fichiers correspondants. Conservez les autres fichiers du projet. La structure apps/web et apps/api correspond au monorepo actuel ; si vous travaillez avec deux dossiers séparés, copiez simplement leur contenu dans les bons dossiers.
3. Aucune dépendance supplémentaire n’est nécessaire : Mongoose, Multer, Cloudinary, React Query et Lucide existent déjà dans les packages fournis.
4. Lancez npm run typecheck à la racine, puis npm run build --workspace=@fades/api et npm run build --workspace=@fades/web.
5. Redémarrez l’API et le frontend.
6. Dans Configuration > Fonctionnalités, activez Paie si nécessaire, enregistrez le brouillon puis publiez.

## Modules désactivés
La configuration publiée est la source de vérité. Enregistrer un brouillon seul ne change pas les accès.
Après publication : retrait du menu et des listes du tableau de bord, redirection des URL frontend vers le tableau de bord, et réponse API 403 MODULE_DISABLED. Les données sont conservées.
Modules reliés : Agents, Tâches, Pointages, Congés, Feuilles de route, Évaluations, Rapports, Documents RH et Paie. Documents RH masque le panneau du dossier agent et bloque ses routes de documents. Structure, Utilisateurs, Communications et Configuration n’ont pas d’indicateur de module dans la structure fournie et restent soumis à leurs permissions existantes.
Les autres sessions rechargent la configuration sous 60 secondes ou au retour sur la fenêtre ; le contrôle backend s’applique dès publication. Recrutement et Formation ne sont pas livrés : l’interface ne propose pas de les activer artificiellement.

## Paie configurable
Administration et responsable RH : recherche d’agents, création et modification d’un brouillon, validation, enregistrement d’un paiement et annulation avant paiement. L’agent consulte uniquement ses propres bulletins validés ou payés. Direction et chefs de service n’accèdent pas à ce module financier.
Un bulletin porte sur un agent, une période mensuelle et une devise (GNF, EUR, USD, XOF ou XAF). La devise et la période sont fixées à la création. Aucun bulletin actif en double pour le même agent et le même mois ; un bulletin annulé reste conservé et permet de créer un remplacement.
Les taux sont des taux simples saisis sur chaque bulletin, avec une référence de règles obligatoire. Ils sont conservés avec les montants. Il ne s’agit pas d’un moteur de barèmes progressifs ni de déclarations sociales ou fiscales automatiques.
Calcul : brut = base + primes ; cotisation salariale = brut × taux salarial ; cotisation patronale = brut × taux patronal ; assiette d’impôt = brut − cotisation salariale ; impôt = assiette × taux d’impôt ; net = brut − cotisation salariale − impôt − autres retenues. Coût employeur = brut + cotisation patronale.
Les montants sont stockés en unités monétaires minimales entières et les taux en centièmes de pourcentage. Les produits et arrondis utilisent une arithmétique entière exacte. Chaque cotisation et l’impôt sont arrondis à l’unité minimale, les demi-unités vers le haut. GNF/XOF/XAF : 0 décimale ; EUR/USD : 2 décimales.
Valider verrouille les montants. Les changements d’état et versions sont atomiques, avec historique. « Payé » enregistre uniquement un paiement déjà effectué avec sa référence : aucun virement bancaire n’est exécuté. Les paiements partiels, régularisations légales, génération en masse, cotisations à plafonds et barèmes progressifs ne sont pas inclus dans cette version.
Le bulletin est consultable et imprimable/enregistrable en PDF depuis le navigateur. Les taux et la note sont visibles sur le bulletin.

## Photos des agents
Ouvrez le dossier d’un agent : Ajouter une photo / Changer la photo / Supprimer. Modification réservée à l’administration et aux RH. Les portraits apparaissent dans la liste et la fiche. Ils peuvent être ajoutés après création de l’agent.
Formats PNG, JPEG ou WebP, maximum 2 Mo. Le serveur vérifie les signatures de fichier ; Cloudinary redimensionne et stocke une image PNG privée de 512 × 512 pixels. Le frontend reçoit l’image par un endpoint authentifié et un objet URL temporaire, jamais par une adresse Cloudinary publique permanente.
Les droits de consultation existants du dossier sont appliqués. Les remplacements simultanés sont détectés par version. L’ancienne photo est mise dans une file de suppression persistante après remplacement validé. Les échecs sont réessayés par le worker de l’API. Les téléchargements interrompus et les photos d’agents supprimés sont récupérés périodiquement s’ils ne sont plus référencés ; ce nettoyage peut prendre au moins 15 minutes.
Conservez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans apps/api/.env. Les photos nécessitent MongoDB Atlas ou un replica set pour les transactions de remplacement. Un MongoDB autonome sans replica set doit être adapté avant d’utiliser cette fonctionnalité.
Le serveur crée les index des collections de paie et de photos au démarrage pour assurer l’unicité. Le compte MongoDB utilisé doit disposer des droits nécessaires à leur création.

## Compteur des tâches
Le badge indique le nombre de tâches personnelles TODO, IN_PROGRESS ou BLOCKED attribuées à l’agent lié au compte connecté. Les tâches terminées et annulées sont exclues. Il ne représente pas le nombre de toutes les tâches de la direction ou du service.
Rechargement toutes les 15 secondes et au retour sur la fenêtre. Un compte sans agent lié affiche aucun compteur. Le badge reste visible dans la sidebar réduite. Il est suspendu lorsque le module Tâches est désactivé.

## Autres corrections
Les descriptions des en-têtes utilisent désormais la couleur de texte du thème pour corriger le texte trop pâle sur fond clair. Les types backend de configuration ont été remis en cohérence avec les champs d’apparence et editRevision déjà présents dans votre service.

## Vérifications effectuées
- TypeScript et compilation backend complets : réussis.
- TypeScript et compilation frontend complets : réussis ; Vite conserve un avertissement sur la taille du bundle principal.
- 32 contrôles backend : calculs/arrondis, routes HTTP réelles, permissions, module désactivé, doublon, conflit de version, transitions, référence de paiement, photo invalide et origine de requête. MongoDB est remplacé par un adaptateur mémoire pour ces essais ; aucun upload réel Cloudinary.
- 8 scénarios navigateur avec API simulée : création/validation de bulletin, verrouillage d’édition, consultation/fermeture, navigation, masquage, compteur et portrait ; largeurs 320/390/768/1024/1440 sans débordement horizontal et sans erreur JavaScript observée.

Avant utilisation réelle, testez avec deux entreprises et plusieurs rôles sur votre MongoDB et votre compte Cloudinary : publication d’une désactivation, accès direct refusé, création et paiement de bulletins, remplacement/suppression effective de photos et compteur d’un agent. Faites valider vos règles de paie avant d’utiliser les bulletins en exploitation. Les essais automatisés ne certifient pas vos taux ni des obligations légales.
