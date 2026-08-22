import { describe, expect, it } from 'vitest'
import { canSubmitRoundGuess } from './roundEligibility'

describe('canSubmitRoundGuess', () => {
  const base = {
    gameType: 'spot',
    playerId: 'player-1',
    uploaderId: 'player-1',
  };

  it('never benches a player guessing on someone else photo', () => {
    expect(canSubmitRoundGuess({ ...base, uploaderId: 'player-2', uploaderPenaltyPercent: 100 })).toBe(true);
  });

  it('benches the uploader at a 100% penalty in spot, exact date, timeline and uploader games', () => {
    expect(canSubmitRoundGuess({ ...base, uploaderPenaltyPercent: 100 })).toBe(false);
    expect(canSubmitRoundGuess({ ...base, gameType: 'date', dateSubmode: 'exact', uploaderPenaltyPercent: 100 })).toBe(false);
    expect(canSubmitRoundGuess({ ...base, gameType: 'date', dateSubmode: 'timeline', uploaderPenaltyPercent: 100 })).toBe(false);
    expect(canSubmitRoundGuess({ ...base, gameType: 'uploader', uploaderPenaltyPercent: 100 })).toBe(false);
  });

  it('keeps a partial penalty playable', () => {
    expect(canSubmitRoundGuess({ ...base, uploaderPenaltyPercent: 50 })).toBe(true);
    expect(canSubmitRoundGuess({ ...base })).toBe(true);
  });

  it('mirrors the server rule for Before or After cross-uploader pairs', () => {
    const beforeAfter = { ...base, gameType: 'date', dateSubmode: 'before_after', uploaderPenaltyPercent: 100 };
    // The player uploaded the current photo but not the reference: the server
    // applies no uploader tax, so the round must stay playable.
    expect(canSubmitRoundGuess({ ...beforeAfter, referenceUploaderId: 'player-2' })).toBe(true);
    expect(canSubmitRoundGuess({ ...beforeAfter, referenceUploaderId: undefined })).toBe(true);
    // Same uploader on both cards: the tax zeroes the points.
    expect(canSubmitRoundGuess({ ...beforeAfter, referenceUploaderId: 'player-1' })).toBe(false);
  });
});
