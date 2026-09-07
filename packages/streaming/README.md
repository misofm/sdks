# @misofm/streaming

The `miso-hls/v1` streaming transcode contract, as one dependency-free module.

A Miso streaming transcode is a fixed AAC-LC fMP4 ladder (96, 160, 256 kbps,
stereo, source sample rate) cut into aligned segments and packed into one
Walrus Quilt whose items are named by this contract. `@misofm/transcoding`
produces that layout and verifies its output against this module. The
publisher packs items in this module's canonical order. Players build item
URLs from this module's identifiers. None of them restate the layout.

```ts
import { RENDITIONS, segmentIdentifier, chooseSegmentTargetMs } from "@misofm/streaming";

segmentIdentifier("aac-256", 17); // "aac-256-00017.m4s"
chooseSegmentTargetMs(141_087);   // 6000
```

The root entry knows the shape of a transcode and how to address its items on
a Walrus aggregator, and nothing else: no storage client, no encoder.
`@misofm/streaming/player` adds `HlsPlayer`, the browser class the Miso app
uses to attach a stream to an `<audio>` element, with hls.js as an optional
peer that loads only when playback needs it.

```ts
import { HlsPlayer } from "@misofm/streaming/player";

const player = new HlsPlayer({ baseUrl: "https://stream.miso.fm" });
const stream = player.open(audioElement, quiltId, () => resetTransport());
stream.play();
```

## Cold origins

Miso serves transcodes off a Walrus aggregator behind Cloudflare. A cold
segment costs ~2.7 s (2.2 s time-to-first-byte); a warm one costs ~0.1 s.
`HlsPlayer` accounts for the cold case, and `@misofm/streaming/warm` makes
the warm case happen:

- **`HLS_COLD_ORIGIN_DEFAULTS`** — the hls.js config `HlsPlayer` builds its
  engine with: a deterministic `startLevel` (see `startLevelIndex`) so a warm
  primes what actually plays, buffer margin for aggregator tail latency, and
  a longer `maxTimeToFirstByteMs` on both fragment and playlist loads than
  hls.js's own defaults — a first play is a cold master playlist, rendition
  playlist, init segment, and first segment alike. Pass `hlsConfig` to
  `HlsPlayer` to override any of it; overrides are merged with
  `mergeHlsConfig`, which merges `*LoadPolicy` keys (`default`, and its
  `timeoutRetry`/`errorRetry`) one level deeper instead of replacing them
  outright, so a partial override like `{ fragLoadPolicy: { default: {
  maxTimeToFirstByteMs: 5_000 } } }` keeps the rest of the retry policy.
- **`warmTrack` / `HlsPlayer#warm`** — issues the same anonymous-CORS
  requests hls.js's loader will make for a track's opening playlists, init
  segment, and first few media segments, and drains every body so the
  browser's HTTP cache holds them warm for hls.js's later load.

The split is deliberate: this package owns the mechanics of warming and cold
tolerance; the app decides *when* and *what* to warm (on hover, on queue, on
route) by calling `warm` or `warmTrack` itself.

## License

Apache-2.0
