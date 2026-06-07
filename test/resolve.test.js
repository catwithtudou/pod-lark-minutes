const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractMetaContent,
  extractTitle,
  getTagAttribute,
  isDirectAudioUrl,
  parseArgs,
  sanitizeFilename
} = require('../bin/pod-lark-minutes');

test('extracts meta content regardless of attribute order', () => {
  const html = `
    <meta content="https://media.example.com/a.m4a?x=1&amp;y=2" property="og:audio">
    <meta name="og:title" content="Episode &amp; Title">
  `;

  assert.equal(extractMetaContent(html, 'og:audio'), 'https://media.example.com/a.m4a?x=1&y=2');
  assert.equal(extractTitle(html), 'Episode & Title');
});

test('reads single quoted and unquoted tag attributes', () => {
  assert.equal(getTagAttribute("<meta property='og:audio' content='https://example.com/a.mp3'>", 'content'), 'https://example.com/a.mp3');
  assert.equal(getTagAttribute('<meta property=og:audio content=https://example.com/a.mp3>', 'property'), 'og:audio');
});

test('parses default CLI options', () => {
  const { url, options } = parseArgs(['node', 'pod-lark-minutes', 'https://example.com/audio.m4a']);

  assert.equal(url, 'https://example.com/audio.m4a');
  assert.equal(options.audioOnly, false);
  assert.equal(options.cleanup, false);
  assert.match(options.outDir, /pod-lark-minutes-output$/);
});

test('detects audio URLs and sanitizes filenames', () => {
  assert.equal(isDirectAudioUrl('https://example.com/a.m4a?download=1'), true);
  assert.equal(isDirectAudioUrl('https://example.com/page'), false);
  assert.equal(sanitizeFilename('E01: hello / world?'), 'E01_hello_world');
});
