import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDateCommentaryPrompt,
  buildDateGuessPrompt,
  buildTitleHintPrompt,
  buildUploaderCommentaryPrompt,
  normalizeVisionDateOutput,
} from './visionClient.js';

test('date guess prompt is light, structured, and bounded by the uploaded-photo range', () => {
  const prompt = buildDateGuessPrompt('1972-04-03', '2026-07-29');
  assert.match(prompt, /visible clues/);
  assert.match(prompt, /\{"date":"YYYY-MM-DD"\}/);
  assert.match(prompt, /1972-04-03/);
  assert.match(prompt, /2026-07-29/);
  assert.match(prompt, /inclusive/);
});

test('vision date output accepts a full date or defaults a year-month to its first day', () => {
  assert.equal(normalizeVisionDateOutput('2023-05-17'), '2023-05-17');
  assert.equal(normalizeVisionDateOutput(' 2023-05 '), '2023-05-01');
  assert.equal(normalizeVisionDateOutput('2023'), '');
});

test('date commentary prompt compares the AI guess with the real date', () => {
  const prompt = buildDateCommentaryPrompt('en', '1999-07-20', '1989-07-20');
  assert.match(prompt, /1989-07-20/);
  assert.match(prompt, /1999-07-20/);
  assert.match(prompt, /3652 days too early/);
  assert.match(prompt, /self-deprecating/);
  assert.match(prompt, /visible clue/);
  assert.doesNotMatch(prompt, /Mention no locations/);
});

test('date commentary prompt celebrates an exact guess and uses lobby language', () => {
  const prompt = buildDateCommentaryPrompt('de', '2004-03-12', '2004-03-12');
  assert.match(prompt, /exakte Fotodatum/);
  assert.match(prompt, /2004-03-12/);
  assert.doesNotMatch(prompt, /self-deprecating/);
});

test('uploader commentary states the random pick and actual uploader without feigning recognition', () => {
  const prompt = buildUploaderCommentaryPrompt('en', 'Alice', 'Bob');
  assert.match(prompt, /random pick was Bob/);
  assert.match(prompt, /Alice uploaded/);
  assert.match(prompt, /not visual recognition/);
});

test('uploader commentary supplies its facts in the lobby language', () => {
  const prompt = buildUploaderCommentaryPrompt('de', 'Alice', 'Bob');
  assert.match(prompt, /Zufallswahl war Bob/);
  assert.match(prompt, /Alice hat das Foto hochgeladen/);
  assert.doesNotMatch(prompt, /random pick/);
});

test('title and hint prompts are purpose-built for every game mode', () => {
  const spot = buildTitleHintPrompt('en', 'Bavaria', 'Germany', 'spot');
  const date = buildTitleHintPrompt('en', null, null, 'date', '1987-06-03');
  const uploader = buildTitleHintPrompt('en', null, null, 'uploader');
  assert.match(spot, /identifying the region/);
  assert.match(spot, /Bavaria, Germany/);
  assert.match(date, /suggest the photo's era/);
  assert.match(date, /Do not reveal a year/);
  assert.match(date, /verified capture date is 1987-06-03/);
  assert.match(uploader, /Do not identify or imply who/);
  assert.doesNotMatch(uploader, /region/);
});
