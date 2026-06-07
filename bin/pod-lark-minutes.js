#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const packageInfo = require('../package.json');

const execFileAsync = promisify(execFile);
const PACKAGE_NAME = packageInfo.name;
const PACKAGE_VERSION = packageInfo.version;
const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org';
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function printUsage() {
  console.log(`Usage:
  pod-lark-minutes <url> [options]
  pod-lark-minutes --self-update

Options:
  --out-dir <dir>   Output directory (default: ./pod-lark-minutes-output)
  --audio-only      Download audio only; do not upload to Feishu Minutes
  --cleanup         Delete local audio after a successful Minutes upload
  --keep-drive-file Keep uploaded Drive audio after a successful Minutes upload
  --self-update     Install the latest pod-lark-minutes from public npm
  --help            Show this help
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    outDir: path.resolve('pod-lark-minutes-output'),
    audioOnly: false,
    cleanup: false,
    keepDriveFile: false,
    selfUpdate: false
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
    } else if (arg === '--self-update') {
      options.selfUpdate = true;
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

function parseVersion(value) {
  return String(value)
    .split('-')[0]
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(latestVersion, currentVersion) {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  const maxLength = Math.max(latest.length, current.length);

  for (let index = 0; index < maxLength; index += 1) {
    const latestPart = latest[index] || 0;
    const currentPart = current[index] || 0;
    if (latestPart > currentPart) {
      return true;
    }
    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
}

function getUpdateCachePath() {
  const homeDir = os.homedir() || os.tmpdir();
  return path.join(homeDir, '.pod-lark-minutes', 'update-check.json');
}

function readUpdateCache(cachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeUpdateCache(cachePath, data) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
}

function isEnvEnabled(value) {
  return value === '1' || value === 'true' || value === 'yes';
}

async function fetchLatestVersion() {
  const response = await fetch(`${PUBLIC_NPM_REGISTRY}/${PACKAGE_NAME}/latest`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to check npm version: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.version) {
    throw new Error('npm registry response did not include version');
  }
  return data.version;
}

async function runNpm(args) {
  const { stdout, stderr } = await execFileAsync('npm', args, {
    maxBuffer: 20 * 1024 * 1024
  });
  if (stderr && stderr.trim()) {
    process.stderr.write(stderr);
  }
  return { stdout, stderr };
}

async function installLatestPackage(runner = runNpm) {
  return runner([
    'install',
    '-g',
    `${PACKAGE_NAME}@latest`,
    `--registry=${PUBLIC_NPM_REGISTRY}`
  ]);
}

async function checkForUpdates(options = {}, deps = {}) {
  const env = deps.env || process.env;
  if (isEnvEnabled(env.POD_LARK_MINUTES_NO_UPDATE_CHECK)) {
    return { checked: false, reason: 'disabled' };
  }

  const now = deps.now || new Date();
  const cachePath = deps.cachePath || getUpdateCachePath();
  if (!options.force) {
    const cache = readUpdateCache(cachePath);
    const lastCheckedAt = cache.lastCheckedAt ? new Date(cache.lastCheckedAt) : null;
    if (lastCheckedAt && !Number.isNaN(lastCheckedAt.getTime()) && now - lastCheckedAt < UPDATE_CHECK_INTERVAL_MS) {
      return { checked: false, reason: 'recently-checked' };
    }
  }

  const latestVersion = await (deps.fetchLatestVersion || fetchLatestVersion)();
  const currentVersion = deps.currentVersion || PACKAGE_VERSION;
  writeUpdateCache(cachePath, {
    lastCheckedAt: now.toISOString(),
    latestVersion
  });

  if (!isNewerVersion(latestVersion, currentVersion)) {
    return {
      checked: true,
      currentVersion,
      latestVersion,
      updateAvailable: false
    };
  }

  const notify = deps.notify || (() => {});
  const autoUpdate = isEnvEnabled(env.POD_LARK_MINUTES_AUTO_UPDATE);
  if (autoUpdate) {
    await (deps.installLatestPackage || installLatestPackage)();
    notify(`[update] updated ${PACKAGE_NAME} from ${currentVersion} to ${latestVersion}`);
    return {
      checked: true,
      currentVersion,
      latestVersion,
      updateAvailable: true,
      autoUpdated: true
    };
  }

  notify(`[update] ${PACKAGE_NAME} ${latestVersion} is available (current ${currentVersion}). Run: ${PACKAGE_NAME} --self-update`);
  return {
    checked: true,
    currentVersion,
    latestVersion,
    updateAvailable: true,
    autoUpdated: false
  };
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
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (options.selfUpdate) {
    console.log(`[self-update] installing latest ${PACKAGE_NAME} from public npm`);
    await installLatestPackage();
    console.log('[self-update] done');
    process.exit(0);
  }

  if (!url) {
    printUsage();
    process.exit(1);
  }

  try {
    await checkForUpdates({}, {
      notify: message => console.warn(message)
    });
  } catch {
    // Update checks should never block the podcast-to-Minutes workflow.
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
  checkForUpdates,
  decodeHtml,
  fetchLatestVersion,
  extractMetaContent,
  extractTitle,
  getExtensionFromContentType,
  getExtensionFromUrl,
  getTagAttribute,
  installLatestPackage,
  isDirectAudioUrl,
  isNewerVersion,
  parseArgs,
  resolveMedia,
  sanitizeFilename,
  deleteDriveFile,
  uploadAudioToMinutes
};
