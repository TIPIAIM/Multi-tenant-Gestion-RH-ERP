# Dépendances export PDF

À exécuter une fois à la racine du monorepo :

```powershell
npm install -w @fades/web jspdf html2canvas
```

Pourquoi :
- `jspdf` : création du fichier PDF ;
- `html2canvas` : capture du rendu HTML utilisé par le moteur HTML de jsPDF.

Aucune dépendance n'est nécessaire pour l'export Word `.doc`.
