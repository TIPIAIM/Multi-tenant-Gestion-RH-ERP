# Matrice des droits — Rapports V2

| Action | Créateur | Direction habilitée | RH | Admin |
|---|---:|---:|---:|---:|
| Lire selon périmètre | Oui | Oui | Oui | Oui |
| Télécharger PDF | Oui | Oui | Oui | Oui |
| Télécharger Word | Oui | Oui | Oui | Oui |
| Modifier le contenu | Oui, avant validation | Non | Non | Non si non créateur |
| Recalculer | Oui, avant validation | Non | Non | Non si non créateur |
| Valider son propre rapport | Non | Non | Non | Non |
| Valider un rapport d'autrui | Selon périmètre | Oui | Oui | Oui |
| Archiver | Non comme rédacteur | Selon habilitation | Oui | Oui |
| Supprimer avant validation | Oui | Non | Non | Oui |
| Supprimer validé/archivé | Non | Non | Non | Oui |

## Principe d'audit

`createdByUserId` est la source de vérité pour la propriété rédactionnelle.
Le rôle ou le périmètre de lecture ne confère jamais un droit d'édition.
