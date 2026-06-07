# Contributing

## Development

Use Node.js 20 or newer.

```bash
npm install
npm run check
npm test
```

## Scope

Keep this CLI focused on one workflow:

```text
podcast/media URL -> local audio -> Feishu/Lark Minutes
```

New source resolvers should return the same media shape used by `resolveMedia()`:

```js
{
  sourceUrl,
  mediaUrl,
  title,
  description,
  resolver
}
```

## Validation

For parser changes, add network-free fixture tests when possible. For upload behavior, verify with `--audio-only` first, then run the full flow only when `lark-cli` auth is available.

