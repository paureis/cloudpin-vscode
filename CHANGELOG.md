# Changelog

All notable changes to this extension are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), independently of cloudpin's own versions.

## [1.0.0] - Unreleased

### Added

- A status bar item showing whether the cloud CLIs are on the accounts pinned in `.cloudpin.yml`, from
  `cloudpin check --json` (cloudpin 1.2.0 or later): green when they match, red on a mismatch, yellow for an invalid pin
  file, grey when nothing is pinned, when cloudpin is missing or fails, and in Restricted Mode.
- A hover with each pinned cloud's result and cloudpin's fix, escaped as plain text.
- Clicking the item, or **cloudpin: Switch to the pinned accounts**, runs `cloudpin switch` (cloudpin 1.3.0) in a
  terminal; **cloudpin: Refresh** checks again.
- cloudpin is looked up on PATH and run by its full path, never from a PATH entry inside an open workspace folder.

[1.0.0]: https://github.com/paureis/cloudpin-vscode/releases/tag/v1.0.0
