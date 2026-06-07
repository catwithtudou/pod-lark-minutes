#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const execFileAsync = promisify(execFile);

function printUsage() {
  console.log(`Usage:
  pod-lark-minutes <url> [options]

Options:
  --out-dir <dir>   Output directory (default: ./pod-lark-minutes-output)
  --audio-only      Download audio only; do not upload to Feishu Minutes
  --cleanup         Delete local audio after a successful Minutes upload
  --keep-drive-file Keep uploaded Drive audio after a successful Minutes upload
  --help            Show this help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    outDir: path.resolve('pod-lark-minutes-output'),
    audioOnly: false,
    cleanup: false,
    keepDriveFile: false
  };

  let url = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help') {
      options.help = true;
    } else if (arg === '--audio-only') {
      options.audioOnly = true;
    } else if (arg === '--cleanup') {
      options.cleanup = true;
    } else if (arg === '--keep-drive-file') {
      options.keepDriveFile = true;
    } else if (arg === '--out-dir') {
      const value = args[i + 1];
      if (!value) {
        throw new Error('--out-dir requires a value');
      }
      options.outDir = path.resolve(value);
      i += 1;
    } else if (!url) {
      url = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { url, options };
}

function isDirectAudioUrl(url) {
  return /\.(mp3|m4a|aac|wav|ogg|wma|amr)(\?|#|$)/i.test(url);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTagAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) {
    return '';
  }

  return (match[1] || match[2] || match[3] || '').trim();
}

function extractMetaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const metaKey = getTagAttribute(tag, 'property') || getTagAttribute(tag, 'name');
    if (metaKey === key) {
      const content = getTagAttribute(tag, 'content');
      return content ? decodeHtml(content) : '';
    }
  }
  return '';
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTitle(html) {
  const ogTitle = extractMetaContent(html, 'og:title');
  if (ogTitle) {
    return ogTitle;
  }

  const title = html.match(/<title>(.*?)<\/title>/i);
  return title ? decodeHtml(title[1].replace(/\s+/g, ' ').trim()) : '';
}

function sanitizeFilename(value) {
  const cleaned = value
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned.slice(0, 80) || 'podcast-audio';
}

function getExtensionFromUrl(url) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ext || '';
}

function getExtensionFromContentType(contentType) {
  if (!contentType) {
    return '';
  }
  if (contentType.includes('mp4') || contentType.includes('m4a')) return '.m4a';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return '.mp3';
  if (contentType.includes('aac')) return '.aac';
  if (contentType.includes('wav')) return '.wav';
  if (contentType.includes('ogg')) return '.ogg';
  return '';
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function resolveMedia(url) {
  if (isDirectAudioUrl(url)) {
    return {
      sourceUrl: url,
      mediaUrl: url,
      title: path.basename(new URL(url).pathname, getExtensionFromUrl(url)),
      description: '',
      resolver: 'direct-audio'
    };
  }

  const body = await fetchText(url);
  if (body.includes('<rss') || body.includes('<feed')) {
    const enclosure = body.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
    if (enclosure) {
      const title = body.match(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>/i)
        || body.match(/<item>[\s\S]*?<title>(.*?)<\/title>/i);
      return {
        sourceUrl: url,
        mediaUrl: decodeHtml(enclosure[1]),
        title: title ? decodeHtml(title[1].trim()) : 'RSS Episode',
        description: '',
        resolver: 'rss'
      };
    }
  }

  const audioUrl = extractMetaContent(body, 'og:audio');
  if (audioUrl) {
    return {
      sourceUrl: url,
      mediaUrl: audioUrl,
      title: extractTitle(body) || 'Podcast Episode',
      description: extractMetaContent(body, 'og:description'),
      resolver: url.includes('xiaoyuzhoufm.com') ? 'xiaoyuzhou-og-audio' : 'og-audio'
    };
  }

  const jsonLd = body.match(/"contentUrl":"([^"]+\.(?:m4a|mp3|aac|wav|ogg))"/i);
  if (jsonLd) {
    return {
      sourceUrl: url,
      mediaUrl: jsonLd[1],
      title: extractTitle(body) || 'Podcast Episode',
      description: extractMetaContent(body, 'og:description'),
      resolver: 'json-ld-content-url'
    };
  }

  throw new Error('Could not resolve an audio URL from this input');
}

async function downloadMedia(media, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const response = await fetch(media.mediaUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }

  const ext = getExtensionFromContentType(response.headers.get('content-type'))
    || getExtensionFromUrl(media.mediaUrl)
    || '.m4a';
  const filename = `${sanitizeFilename(media.title)}${ext}`;
  const filePath = path.join(outDir, filename);

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
  return filePath;
}

function parseJsonOutput(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error(`Command did not return JSON: ${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function runLarkCli(args, options = {}) {
  const { stdout, stderr } = await execFileAsync('lark-cli', args, {
    cwd: options.cwd || process.cwd(),
    maxBuffer: 20 * 1024 * 1024
  });
  if (stderr && stderr.trim()) {
    process.stderr.write(stderr);
  }
  return parseJsonOutput(stdout);
}

async function uploadToDrive(audioPath) {
  const cwd = path.dirname(audioPath);
  const basename = path.basename(audioPath);
  return runLarkCli([
    'drive',
    '+upload',
    '--as',
    'user',
    '--file',
    `./${basename}`,
    '--name',
    basename,
    '--json'
  ], { cwd });
}

async function createMinute(fileToken) {
  return runLarkCli([
    'minutes',
    '+upload',
    '--as',
    'user',
    '--file-token',
    fileToken,
    '--json'
  ]);
}

async function deleteDriveFile(fileToken, runner = runLarkCli) {
  return runner([
    'drive',
    '+delete',
    '--as',
    'user',
    '--file-token',
    fileToken,
    '--type',
    'file',
    '--yes',
    '--json'
  ]);
}

async function uploadAudioToMinutes(audioPath, options = {}, deps = {}) {
  const upload = deps.uploadToDrive || uploadToDrive;
  const create = deps.createMinute || createMinute;
  const deleteDrive = deps.deleteDriveFile || deleteDriveFile;
  const log = deps.log || (() => {});
  const warn = deps.warn || (() => {});

  log('[drive-upload] uploading audio to Feishu Drive');
  const driveResult = await upload(audioPath);
  const run = {
    drive: driveResult.data || driveResult,
    driveDeleted: false,
    driveRetained: false
  };
  const fileToken = run.drive && run.drive.file_token;
  if (!fileToken) {
    throw new Error('Drive upload did not return data.file_token');
  }

  log('[minutes-upload] creating Feishu Minutes');
  const minutesResult = await create(fileToken);
  run.minutes = minutesResult.data || minutesResult;

  if (options.keepDriveFile) {
    run.driveRetained = true;
    log('[drive-cleanup] kept uploaded Drive audio file');
    return run;
  }

  log('[drive-cleanup] deleting uploaded Drive audio file');
  try {
    const deleteResult = await deleteDrive(fileToken);
    run.driveCleanup = deleteResult.data || deleteResult;
    run.driveDeleted = Boolean(run.driveCleanup && run.driveCleanup.deleted);
    log('[drive-cleanup] deleted uploaded Drive audio file');
  } catch (error) {
    run.driveCleanup = {
      deleted: false,
      error: error.message
    };
    warn(`[drive-cleanup] failed to delete uploaded Drive audio file: ${error.message}`);
  }

  return run;
}

function writeRunMetadata(outDir, data) {
  const runsDir = path.join(outDir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runPath = path.join(runsDir, `${runId}.json`);
  fs.writeFileSync(runPath, JSON.stringify(data, null, 2), 'utf8');
  return runPath;
}

async function main() {
  const { url, options } = parseArgs(process.argv);
  if (options.help || !url) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const audioDir = path.join(options.outDir, 'audio');
  console.log(`[resolve] ${url}`);
  const media = await resolveMedia(url);
  console.log(`[resolve] ${media.resolver}: ${media.title}`);
  console.log(`[download] ${media.mediaUrl}`);
  const audioPath = await downloadMedia(media, audioDir);
  console.log(`[download] saved: ${audioPath}`);

  const run = {
    sourceUrl: url,
    media,
    audioPath,
    createdAt: new Date().toISOString()
  };

  if (!options.audioOnly) {
    Object.assign(run, await uploadAudioToMinutes(audioPath, options, {
      log: message => console.log(message),
      warn: message => console.warn(message)
    }));
    console.log(`[minutes-upload] ${run.minutes.minute_url}`);

    if (options.cleanup) {
      fs.unlinkSync(audioPath);
      run.audioDeleted = true;
      console.log('[cleanup] deleted local audio');
    }
  }

  const runPath = writeRunMetadata(options.outDir, run);
  console.log(`[done] metadata: ${runPath}`);

  if (run.minutes && run.minutes.minute_url) {
    console.log(`[done] minute_url: ${run.minutes.minute_url}`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[error] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  decodeHtml,
  extractMetaContent,
  extractTitle,
  getExtensionFromContentType,
  getExtensionFromUrl,
  getTagAttribute,
  isDirectAudioUrl,
  parseArgs,
  resolveMedia,
  sanitizeFilename,
  deleteDriveFile,
  uploadAudioToMinutes
};
