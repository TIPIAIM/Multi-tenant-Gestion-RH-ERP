# Matrice métier Roadmap V10

| Propriétaire de la feuille | Écriture / Soumission | Validation du plan | Dépôt KPI / Réalisation | Validation KPI | Lecture / téléchargement |
|---|---|---|---|---|---|
| AGENT avec Service | Propriétaire uniquement | Chef de service | Propriétaire uniquement | Chef de service | Propriétaire, Chef de service, Direction, RH, Admin selon périmètre |
| AGENT sans Service | Propriétaire uniquement | Chef de département | Propriétaire uniquement | Chef de département | Propriétaire, Direction, RH, Admin |
| SERVICE_MANAGER | Propriétaire uniquement | Chef de département | Propriétaire uniquement | Chef de département | Propriétaire, Direction, RH, Admin |
| DIRECTION | Propriétaire uniquement | RH / Admin secours | Propriétaire uniquement | RH / Admin secours | Propriétaire, RH, Admin |
| RH_MANAGER | Propriétaire uniquement | Admin | Propriétaire uniquement | Admin | RH, Admin |
| TENANT_ADMIN | Propriétaire uniquement | RH ou autre Admin | Propriétaire uniquement | RH ou autre Admin | RH, Admin |

## Règles fortes

1. La propriété est déterminée par `createdByUserId`, pas uniquement par `agentId`.
2. Aucun supérieur hiérarchique ne peut modifier les objectifs ou renseigner les KPI d'autrui.
3. Aucun RH ne peut modifier les KPI d'autrui.
4. Chef de service : une seule validation, par la Direction. Pas de seconde validation RH.
5. Direction : validation RH.
6. Une réalisation KPI soumise passe en `PENDING_REVIEW` et devient verrouillée.
7. `VALIDATED` : verrouillage définitif.
8. `NEEDS_DISCUSSION` : la mission est rouverte uniquement pour son propriétaire.
9. Toute personne autorisée à lire la feuille peut télécharger une pièce KPI existante.
10. Clôture administrative : Admin uniquement, et seulement lorsque tous les KPI sont validés.
