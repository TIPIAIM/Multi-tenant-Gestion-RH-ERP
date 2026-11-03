export const GIB = 1024 ** 3;
/** Cible souple : un fichier plus gros reste entier dans son propre volume. */
export const VOLUME_TARGET = 500 * 1024 ** 2;
export const VOLUME_FILE_COUNT = 200;
export function shouldFlushVolume(
  bytes: number,
  count: number,
  nextSize: number,
) {
  return (
    count > 0 &&
    (bytes + nextSize > VOLUME_TARGET || count >= VOLUME_FILE_COUNT)
  );
}
export function largeDownloadMessage(knownBytes: number, unknownSizes = 0) {
  const message =
    knownBytes > VOLUME_TARGET
      ? (knownBytes > GIB
          ? "Le volume dépasse 1 Go. "
          : "Le volume dépasse 500 Mo. ") +
        "La copie sera répartie en volumes ZIP d’environ 500 Mo. Téléchargez-les un par un, puis ouvrez chaque ZIP. Un fichier de plus de 500 Mo reste entier dans un volume distinct. Vérifiez l’espace disponible sur votre ordinateur et gardez votre connexion active pendant chaque téléchargement."
      : "Votre téléchargement se prépare. Vous pouvez continuer à utiliser la plateforme.";
  return (
    message +
    (unknownSizes
      ? " Certaines tailles sont inconnues ; le volume réel peut être supérieur à l’estimation."
      : "")
  );
}
