const API_VERSION = "1.16.1";
const CLIENT = "MyGo Music Navidrome";
const PAGE_SIZE = 40;
const trackCache = new Map();
const t = host.t;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function setting(key) {
  return String(host.setting(key) || "").trim();
}

function serverRoot() {
  const raw = setting("server");
  if (!raw) fail("setup", t("Set the Navidrome server URL in plugin settings."));

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("setup", t("Enter a full server URL, including http:// or https://."));
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.host || url.username || url.password) {
    fail("setup", t("Enter a valid HTTP or HTTPS server URL without embedded credentials."));
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

function credentials() {
  const username = setting("username");
  const password = setting("password");
  if (!username || !password) fail("setup", t("Set your Navidrome username and password in plugin settings."));

  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 32);
  return {
    u: username,
    t: host.crypto.md5(password + salt),
    s: salt,
    v: API_VERSION,
    c: CLIENT,
    f: "json",
  };
}

function encodeQuery(values) {
  const parts = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return parts.join("&");
}

function endpoint(method, params = {}) {
  const query = encodeQuery({ ...credentials(), ...params });
  return `${serverRoot()}/rest/${method}.view?${query}`;
}

async function api(method, params = {}) {
  const response = await fetch(endpoint(method, params), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${t("Navidrome request failed")}: HTTP ${response.status}`);

  const body = await response.json();
  const result = body["subsonic-response"] || body.subsonicResponse;
  if (!result) throw new Error(t("Navidrome returned an invalid response."));
  if (result.status !== "ok") {
    const detail = result.error && result.error.message ? result.error.message : t("Unknown server error");
    const code = String(result.error && result.error.code || "");
    if (code === "10" || code === "40" || code === "41") fail("signIn", detail);
    throw new Error(`${t("Navidrome error")}: ${detail}`);
  }
  return result;
}

function list(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function coverArt(id, size = 500) {
  if (!id) return "";
  return endpoint("getCoverArt", { id, size });
}

function mapArtist(artist) {
  if (!artist) return null;
  return {
    id: String(artist.id || artist.name || ""),
    name: artist.name || t("Unknown artist"),
    imageUrl: coverArt(artist.coverArt),
  };
}

function mapAlbum(album) {
  if (!album) return null;
  const artists = list(album.artist || album.artistName).map((name) => ({
    id: String(album.artistId || name),
    name: String(name),
  }));
  return {
    id: String(album.id || ""),
    name: album.name || t("Unknown album"),
    imageUrl: coverArt(album.coverArt),
    artists,
    released: album.year ? `${album.year}-01-01` : "",
  };
}

function mapTrack(song) {
  const id = String(song.id || "");
  const artist = { id: String(song.artistId || song.artist || ""), name: song.artist || t("Unknown artist") };
  const album = {
    id: String(song.albumId || song.id || ""),
    name: song.album || t("Unknown album"),
    imageUrl: coverArt(song.coverArt),
    artists: song.albumArtist ? [{ id: String(song.albumArtistId || song.albumArtist), name: song.albumArtist }] : [artist],
    released: song.year ? `${song.year}-01-01` : "",
  };
  const track = {
    id,
    name: song.title || song.name || t("Unknown track"),
    artists: [artist],
    album,
    duration: Math.round(Number(song.duration || 0) * 1000),
    unavailable: false,
  };
  trackCache.set(id, song);
  return track;
}

function mapPlaylist(playlist) {
  return {
    id: String(playlist.id || ""),
    name: playlist.name || t("Untitled playlist"),
    imageUrl: coverArt(playlist.coverArt),
    description: playlist.comment || "",
    owner: playlist.owner || "",
    trackCount: Number(playlist.songCount || 0),
    mine: !playlist.owner || playlist.owner === setting("username"),
  };
}

async function albumList(type, offset = 0, size = PAGE_SIZE) {
  const result = await api("getAlbumList2", { type, offset, size });
  const albums = list(result.albumList2 && result.albumList2.album);
  return { albums: albums.map(mapAlbum), more: albums.length >= size };
}

async function playlistsList() {
  const result = await api("getPlaylists");
  return list(result.playlists && result.playlists.playlist).map(mapPlaylist);
}

async function starred() {
  const result = await api("getStarred2");
  return list(result.starred2 && result.starred2.song);
}

export function setSetting({ key }) {
  if (["server", "username", "password"].includes(key)) host.storage.remove("account");
}

export async function signIn() {
  const response = await api("ping");
  if (response.status !== "ok") throw new Error(t("Could not connect to Navidrome."));
  const account = { id: setting("username"), name: setting("username") };
  host.storage.set("account", account);
  return account;
}

export function signOut() {
  host.storage.remove("account");
}

export function account() {
  return host.storage.get("account") || null;
}

export async function home() {
  const [newest, songs, playlists] = await Promise.all([
    albumList("newest", 0, 12),
    starred(),
    playlistsList(),
  ]);
  return {
    title: "Navidrome",
    sections: [
      { title: t("Recently added"), albums: newest.albums, morePage: "newest" },
      { title: t("Starred tracks"), tracks: songs.slice(0, 12).map(mapTrack), morePage: "starred" },
      { title: t("Playlists"), playlists: playlists.slice(0, 12), morePage: "playlists" },
    ],
  };
}

export async function browse({ page }) {
  if (page === "newest") {
    const result = await albumList("newest", 0, 500);
    return { title: t("Recently added"), sections: [{ title: t("Albums"), albums: result.albums }] };
  }
  if (page === "albums") {
    const result = await albumList("alphabeticalByName", 0, 500);
    return { title: t("Albums"), sections: [{ albums: result.albums }] };
  }
  if (page === "playlists") {
    const items = await playlistsList();
    return { title: t("Playlists"), sections: [{ playlists: items }] };
  }
  if (page === "artists") {
    const result = await api("getArtists");
    const indexes = list(result.artists && result.artists.index);
    const artists = indexes.flatMap((index) => list(index.artist)).map(mapArtist);
    return { title: t("Artists"), sections: [{ artists }] };
  }
  if (page === "starred") {
    const songs = await starred();
    return { title: t("Starred tracks"), sections: [{ tracks: songs.map(mapTrack) }] };
  }
  fail("unavailable", t("No such Navidrome page."));
}

export async function search({ query, kind, offset = 0 }) {
  const q = String(query || "").trim();
  if (!q) return { [kind]: [], more: false };
  if (kind === "playlists") {
    const found = (await playlistsList()).filter((item) => item.name.toLowerCase().includes(q.toLowerCase()));
    return { playlists: found.slice(offset, offset + PAGE_SIZE), more: found.length > offset + PAGE_SIZE };
  }
  if (!["tracks", "albums", "artists"].includes(kind)) return { [kind]: [], more: false };

  const params = { query: q, songCount: 0, albumCount: 0, artistCount: 0 };
  params[`${kind === "tracks" ? "song" : kind === "albums" ? "album" : "artist"}Count`] = PAGE_SIZE;
  params[`${kind === "tracks" ? "song" : kind === "albums" ? "album" : "artist"}Offset`] = offset;
  const result = await api("search3", params);
  const found = result.searchResult3 || {};
  const items = list(found[kind === "tracks" ? "song" : kind === "albums" ? "album" : "artist"]);
  const mapped = items.map(kind === "tracks" ? mapTrack : kind === "albums" ? mapAlbum : mapArtist);
  return { [kind]: mapped, more: items.length >= PAGE_SIZE };
}

export async function liked({ offset = 0 }) {
  const songs = await starred();
  return { tracks: songs.slice(offset, offset + PAGE_SIZE).map(mapTrack), more: offset + PAGE_SIZE < songs.length };
}

export async function isLiked({ ids }) {
  const likedIds = new Set((await starred()).map((song) => String(song.id)));
  return Object.fromEntries(ids.map((id) => [id, likedIds.has(String(id))]));
}

export async function like({ id, on }) {
  await api(on ? "star" : "unstar", { id });
}

export async function album({ id, offset = 0 }) {
  const result = await api("getAlbum", { id });
  const source = result.album;
  if (!source) fail("unavailable", t("Album not found."));
  const songs = list(source.song);
  return { album: mapAlbum(source), tracks: songs.slice(offset).map(mapTrack) };
}

export async function artist({ id }) {
  const result = await api("getArtist", { id });
  const source = result.artist;
  if (!source) fail("unavailable", t("Artist not found."));
  return { artist: mapArtist(source), albums: list(source.album).map(mapAlbum) };
}

export async function playlists() {
  return playlistsList();
}

export async function playlist({ id }) {
  const result = await api("getPlaylist", { id });
  const source = result.playlist;
  if (!source) fail("unavailable", t("Playlist not found."));
  return { ...mapPlaylist(source), tracks: list(source.entry).map(mapTrack) };
}

export async function played({ id }) {
  await api("scrobble", { id, submission: "true" });
}

function audioType(song) {
  const suffix = String(song.suffix || "").toLowerCase();
  const contentType = String(song.contentType || "").toLowerCase();
  const type = suffix || ({
    "audio/mpeg": "mp3",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
  })[contentType] || "";
  return ["mp3", "flac", "ogg", "wav", "m4a", "aac"].includes(type) ? type : "";
}

export async function stream({ id, quality }) {
  let song = trackCache.get(String(id));
  if (!song) {
    const result = await api("getSong", { id });
    song = result.song;
  }
  if (!song) fail("unavailable", t("Track not found."));

  const type = audioType(song);
  const params = { id };
  let outputType = type;
  if (quality === "standard" || quality === "high") {
    params.format = "mp3";
    params.maxBitRate = quality === "standard" ? 128 : 320;
    outputType = "mp3";
  } else if (!type) {
    params.format = "mp3";
    params.maxBitRate = 320;
    outputType = "mp3";
  } else {
    params.format = "raw";
  }
  return {
    url: endpoint("stream", params),
    type: outputType,
    bitRate: Number(song.bitRate || 0),
    size: Number(song.size || 0),
  };
}
