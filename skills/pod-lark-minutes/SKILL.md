---
name: pod-lark-minutes
description: Use when the user wants to install, verify, or run the pod-lark-minutes CLI to create Feishu/Lark Minutes from podcast, Xiaoyuzhou, RSS, or direct audio URLs. This skill covers dependency checks, CLI installation, audio-only validation, full Feishu/Lark Minutes upload, default temporary Drive cleanup, local cleanup, and safe handling of tokens and generated audio.
---

# Pod Lark Minutes

## Overview

Use this skill to help a user install and run `pod-lark-minutes`, a Node.js CLI that turns podcast or media URLs into Feishu/Lark Minutes links:

```text
podcast/media URL -> local audio -> temporary Feishu/Lark Drive upload -> Feishu/Lark Minutes
```

The CLI does not fetch transcripts or smart summaries back to local files. Feishu/Lark Minutes generates those artifacts after upload.

Feishu/Lark Drive is a temporary bridge required by `lark-cli minutes +upload`, which accepts a Drive `file_token` rather than a local file path. After Minutes creation succeeds, `pod-lark-minutes` deletes the uploaded Drive audio file by default. Use `--keep-drive-file` only when the user explicitly wants to retain that Drive file.

## Workflow

1. Confirm the user's goal:
   - `audio-only`: resolve and download audio without uploading.
   - `minutes upload`: upload audio to Feishu/Lark Drive and create a Minutes link.
   - `install only`: install or verify the CLI.
2. Check local prerequisites:

```bash
node --version
npm --version
command -v pod-lark-minutes || true
command -v lark-cli || true
```

Node.js must be 20 or newer. `lark-cli` is required only for full Feishu/Lark upload, not for `--audio-only`.

3. Install the CLI if needed. Prefer the npm package:

```bash
npm install -g pod-lark-minutes
pod-lark-minutes --help
```

If the npm package is unavailable in the user's registry, install from GitHub:

```bash
npm install -g github:catwithtudou/pod-lark-minutes
pod-lark-minutes --help
```

From a local checkout:

```bash
npm install
npm link
pod-lark-minutes --help
```

4. For audio-only validation, use a temporary output directory and delete downloaded audio after checking success:

```bash
pod-lark-minutes "<podcast-or-audio-url>" --audio-only --out-dir "<temporary-output-dir>"
```

Report the metadata path, then remove generated audio files unless the user explicitly wants to keep them.

5. For full upload, verify `lark-cli` auth before running the command:

```bash
lark-cli --version
lark-cli drive +upload --help
lark-cli minutes +upload --help
pod-lark-minutes "<podcast-or-audio-url>" --out-dir "<output-dir>" --cleanup
```

By default, the CLI deletes the uploaded Drive audio file after Minutes creation. Use `--cleanup` when the user also wants to avoid keeping local audio after a successful Minutes upload. Add `--keep-drive-file` only when the user wants to retain the uploaded Drive audio file.

## Supported Inputs

- Xiaoyuzhou episode pages through `og:audio`.
- Direct audio URLs ending in formats such as `.m4a`, `.mp3`, `.aac`, `.wav`, or `.ogg`.
- Basic RSS feeds with an `<enclosure>` URL.
- Other pages only when they expose `og:audio` or JSON-LD `contentUrl`.

## Safety Rules

- Do not print, commit, or summarize Feishu/Lark tokens, auth URLs, internal Minutes links, file tokens, or user account details.
- Do not keep downloaded audio in the repo or long-lived workspace folders unless the user explicitly asks for it.
- Do not keep uploaded Drive audio files unless the user explicitly asks for `--keep-drive-file`.
- If a smoke test downloads audio, delete the generated audio after validation and tell the user where the run metadata remains.
- Do not assume transcript retrieval is part of the task. Only pursue transcript or summary export when the user explicitly asks for local artifacts.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| CLI not found | Install from GitHub or run `npm link` in a local checkout. |
| Node version error | Use Node.js 20 or newer. |
| Audio URL cannot be resolved | Confirm the page exposes `og:audio`, JSON-LD `contentUrl`, or RSS `<enclosure>`. |
| Drive upload fails | Check `lark-cli` auth, user scope, and Drive upload permission. |
| Minutes upload fails | Check Minutes upload permission and whether Feishu/Lark Minutes supports the uploaded file type. |
| Drive cleanup fails | The Minutes link should still be reported; manually delete the Drive file or rerun with `--keep-drive-file` if retaining it is acceptable. |

## Completion Checklist

- `pod-lark-minutes --help` works.
- For `audio-only`, an audio file and run metadata were generated, then audio was cleaned up if not needed.
- For full upload, the command returned a Minutes URL, deleted the uploaded Drive file by default, and cleaned up local audio when `--cleanup` was used.
- Sensitive Feishu/Lark values were not exposed in the final response.
