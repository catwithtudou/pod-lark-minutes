const assert = require('node:assert/strict');
const test = require('node:test');

const {
  extractMetaContent,
  extractTitle,
  getTagAttribute,
  isDirectAudioUrl,
  parseArgs,
  sanitizeFilename,
  uploadAudioToMinutes,
  deleteDriveFile
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
  assert.equal(options.keepDriveFile, false);
  assert.match(options.outDir, /pod-lark-minutes-output$/);
});

test('parses keep drive file option', () => {
  const { options } = parseArgs([
    'node',
    'pod-lark-minutes',
    'https://example.com/audio.m4a',
    '--keep-drive-file'
  ]);

  assert.equal(options.keepDriveFile, true);
});

test('detects audio URLs and sanitizes filenames', () => {
  assert.equal(isDirectAudioUrl('https://example.com/a.m4a?download=1'), true);
  assert.equal(isDirectAudioUrl('https://example.com/page'), false);
  assert.equal(sanitizeFilename('E01: hello / world?'), 'E01_hello_world');
});

test('deletes uploaded drive file by default after creating minutes', async () => {
  const calls = [];
  const run = await uploadAudioToMinutes('/tmp/audio.m4a', {}, {
    uploadToDrive: async audioPath => {
      calls.push(['upload', audioPath]);
      return { data: { file_token: 'drive-token', name: 'audio.m4a' } };
    },
    createMinute: async fileToken => {
      calls.push(['minutes', fileToken]);
      return { data: { minute_url: 'https://example.com/minutes/minute-token' } };
    },
    deleteDriveFile: async fileToken => {
      calls.push(['delete-drive', fileToken]);
      return { data: { deleted: true, file_token: fileToken, type: 'file' } };
    }
  });

  assert.deepEqual(calls, [
    ['upload', '/tmp/audio.m4a'],
    ['minutes', 'drive-token'],
    ['delete-drive', 'drive-token']
  ]);
  assert.equal(run.driveDeleted, true);
  assert.equal(run.driveRetained, false);
});

test('keeps uploaded drive file when requested', async () => {
  const calls = [];
  const run = await uploadAudioToMinutes('/tmp/audio.m4a', { keepDriveFile: true }, {
    uploadToDrive: async () => ({ data: { file_token: 'drive-token' } }),
    createMinute: async fileToken => {
      calls.push(['minutes', fileToken]);
      return { data: { minute_url: 'https://example.com/minutes/minute-token' } };
    },
    deleteDriveFile: async fileToken => {
      calls.push(['delete-drive', fileToken]);
      return { data: { deleted: true } };
    }
  });

  assert.deepEqual(calls, [
    ['minutes', 'drive-token']
  ]);
  assert.equal(run.driveDeleted, false);
  assert.equal(run.driveRetained, true);
});

test('records drive cleanup failure without losing the minutes result', async () => {
  const run = await uploadAudioToMinutes('/tmp/audio.m4a', {}, {
    uploadToDrive: async () => ({ data: { file_token: 'drive-token' } }),
    createMinute: async () => ({ data: { minute_url: 'https://example.com/minutes/minute-token' } }),
    deleteDriveFile: async () => {
      throw new Error('delete failed');
    }
  });

  assert.equal(run.driveDeleted, false);
  assert.equal(run.driveRetained, false);
  assert.equal(run.minutes.minute_url, 'https://example.com/minutes/minute-token');
  assert.equal(run.driveCleanup.error, 'delete failed');
});

test('deletes drive files with explicit high-risk confirmation', async () => {
  let capturedArgs = null;
  const result = await deleteDriveFile('drive-token', async args => {
    capturedArgs = args;
    return { data: { deleted: true } };
  });

  assert.deepEqual(capturedArgs, [
    'drive',
    '+delete',
    '--as',
    'user',
    '--file-token',
    'drive-token',
    '--type',
    'file',
    '--yes',
    '--json'
  ]);
  assert.deepEqual(result, { data: { deleted: true } });
});
