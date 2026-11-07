# MyGo Music Navidrome Plugin

Connects MyGo Music to a Navidrome server through its Subsonic-compatible API.

## Features

- Sign in with a Navidrome server URL, username and password
- Search tracks, albums and artists; search playlists by name
- Browse recently added albums, the library's albums and artists, and playlists
- View album, artist and playlist pages
- Read and update starred tracks
- Stream original supported formats or request MP3 transcoding
- Report played tracks back to Navidrome

## Install

In MyGo Music, open **Settings > Plugins > +** and choose this folder or a ZIP made from its contents. Then fill in the server URL, username and password in the plugin settings and sign in.

The URL may include a reverse-proxy path, for example `https://music.example.com/navidrome`. Use `http://` only on a trusted network; HTTPS is recommended for remote access.

## Network access and credentials

The plugin asks for MyGo Music's `network: ["*"]` permission because each person can point it at a different Navidrome hostname, including a private LAN address. API calls, artwork and audio are sent only to the server URL configured in the plugin. Review the source before installing it.

MyGo Music's plugin settings are stored locally. Use a dedicated Navidrome account with only the library permissions you need, and avoid reusing an administrator password.

## Playback quality

MyGo Music's `standard` and `high` qualities request MP3 transcoding at up to 128 and 320 kbps. `lossless` (and an unset quality) streams the original supported format. Unknown formats are requested as MP3. MP3 transcoding depends on the Navidrome server's configured transcoder.

## Compatibility

The plugin uses the Subsonic API with OpenSubsonic API version `1.16.1`. Navidrome versions that implement the corresponding endpoints are required for search, artwork, playlists, starring and playback.
