# Changelog

## 0.3.0 - 2026-06-07

- Check public npm for a newer version at most once per day during normal CLI runs.
- Add `--self-update` to explicitly install the latest public npm package.
- Add `POD_LARK_MINUTES_NO_UPDATE_CHECK=1` to disable update checks and `POD_LARK_MINUTES_AUTO_UPDATE=1` to opt in to automatic installation.

## 0.2.0 - 2026-06-07

- Delete the uploaded Feishu/Lark Drive audio file by default after Minutes creation succeeds.
- Add `--keep-drive-file` for users who want to retain the uploaded Drive audio file.
- Record Drive cleanup status in run metadata without discarding a successfully created Minutes link if cleanup fails.

## 0.1.0 - 2026-06-07

- Initial CLI for resolving podcast/media URLs to local audio files.
- Add Xiaoyuzhou episode page, direct audio URL, and basic RSS enclosure support.
- Add Feishu/Lark Drive upload and Minutes creation through `lark-cli`.
