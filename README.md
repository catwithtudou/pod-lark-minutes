# pod-lark-minutes

`pod-lark-minutes` creates Feishu/Lark Minutes from podcast and media URLs.

It keeps the workflow intentionally small:

```text
podcast/media URL -> local audio -> Feishu/Lark Drive file -> Feishu/Lark Minutes
```

Feishu Minutes handles transcription and smart summary after the upload. This CLI focuses on resolving and uploading the audio source.

## Features

- Resolve Xiaoyuzhou episode pages through `og:audio`.
- Download direct audio URLs such as `.m4a`, `.mp3`, `.aac`, `.wav`, and `.ogg`.
- Resolve the first enclosure from basic RSS feeds.
- Upload local audio with `lark-cli drive +upload`.
- Create a Minutes link with `lark-cli minutes +upload`.
- Record each run as JSON metadata.

## Requirements

- Node.js 20+
- `lark-cli`
- Feishu/Lark user auth with scopes for Drive upload and Minutes upload

## Usage

Run from a local checkout:

```bash
node bin/pod-lark-minutes.js "https://www.xiaoyuzhoufm.com/episode/xxxx"
```

After `npm link`, use the CLI name directly:

```bash
npm link
pod-lark-minutes "https://www.xiaoyuzhoufm.com/episode/xxxx"
```

Download audio only:

```bash
pod-lark-minutes "https://www.xiaoyuzhoufm.com/episode/xxxx" --audio-only
```

Use a custom output directory:

```bash
pod-lark-minutes "https://www.xiaoyuzhoufm.com/episode/xxxx" --out-dir ./outputs
```

Remove local audio after a successful Minutes upload:

```bash
pod-lark-minutes "https://www.xiaoyuzhoufm.com/episode/xxxx" --cleanup
```

## Output

```text
pod-lark-minutes-output/
  audio/
    <title>.m4a
  runs/
    <run-id>.json
```

The run JSON records the source URL, resolved media URL, local audio path, Drive upload result, and `minute_url`.

## Supported Inputs

| Input | Status |
| --- | --- |
| Xiaoyuzhou episode URL | Supported |
| Direct audio URL | Supported |
| RSS feed with `<enclosure>` | Basic support |
| Other podcast platforms | Works only when the page exposes `og:audio` or JSON-LD `contentUrl` |

## Development

```bash
npm install
npm run check
npm test
```

For Feishu/Lark CLI and OpenAPI, upload is a two-step flow:

```text
local file -> drive +upload -> file_token -> minutes +upload -> minute_url
```

The web UI may hide this detail, but the CLI needs the file token.
