# pod2miao

`pod2miao` turns a podcast or media URL into a Feishu/Lark Minutes link.

Current MVP:

- Xiaoyuzhou episode page -> m4a audio
- Direct audio URL -> local audio
- Basic RSS feed -> first enclosure audio
- Upload local audio with `lark-cli drive +upload`
- Generate a Minutes link with `lark-cli minutes +upload`

It does not fetch transcript or summary by default. Feishu Minutes generates those inside Feishu after the upload.

## Requirements

- Node.js 20+
- `lark-cli`
- Lark user auth with enough scopes for Drive upload and Minutes upload

## Usage

```bash
node bin/pod2miao.js "https://www.xiaoyuzhoufm.com/episode/xxxx"
```

Audio-only:

```bash
node bin/pod2miao.js "https://www.xiaoyuzhoufm.com/episode/xxxx" --audio-only
```

Custom output directory:

```bash
node bin/pod2miao.js "https://www.xiaoyuzhoufm.com/episode/xxxx" --out-dir ./outputs
```

Remove local audio after a successful Minutes upload:

```bash
node bin/pod2miao.js "https://www.xiaoyuzhoufm.com/episode/xxxx" --cleanup
```

## Output

```text
pod2miao-output/
  audio/
    <title>.m4a
  runs/
    <run-id>.json
```

The run JSON records source URL, audio URL, local audio path, Drive upload result, and `minute_url`.

## Notes

For Feishu/Lark CLI and OpenAPI, media upload is a two-step flow:

```text
local file -> drive +upload -> file_token -> minutes +upload -> minute_url
```

The web UI may hide this detail, but the CLI needs the file token.
