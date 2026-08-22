/**
 * Mirrors the server's uploader-penalty rule from _scoreDateChallenge: a
 * player is only benched by a 100% penalty when that penalty would actually
 * zero their points. In Before or After the tax applies only when the same
 * player uploaded both the current photo and the reference card, so a
 * cross-uploader pair must stay playable.
 */
export function canSubmitRoundGuess({
  gameType,
  dateSubmode,
  uploaderId,
  referenceUploaderId,
  playerId,
  uploaderPenaltyPercent,
}: {
  gameType: string;
  dateSubmode?: string;
  uploaderId?: string;
  referenceUploaderId?: string;
  playerId: string;
  uploaderPenaltyPercent?: number;
}): boolean {
  if (uploaderId !== playerId) return true;
  if ((uploaderPenaltyPercent ?? 10) < 100) return true;
  if (gameType === 'date' && (dateSubmode || 'exact') === 'before_after') {
    return referenceUploaderId !== playerId;
  }
  return false;
}
