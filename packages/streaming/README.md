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
  a longer `maxTimeToFirstByteMs` on fragment loads than hls.js's own
  default. Pass `hlsConfig` to `HlsPlayer` to override any of it.
- **`warmTrack` / `HlsPlayer#warm`** — issues the same anonymous-CORS
  requests hls.js's loader will make for a track's opening playlists, init
  segment, and first few media segments, and drains every body so the
  browser's HTTP cache holds them warm for hls.js's later load.

The split is deliberate: this package owns the mechanics of warming and cold
tolerance; the app decides *when* and *what* to warm (on hover, on queue, on
route) by calling `warm` or `warmTrack` itself.

## Effects and lifecycle

The `/warm` and `/player` entries use `effect@4.0.0-rc.112`; the root
contract still imports no runtime dependencies. `warmTrackEffect` composes
fetching and body draining with a default concurrency of 6, configurable with
`concurrency`. Non-2xx responses are also drained. `warmTrack` preserves the
original rejection object, including fetch AbortErrors. An options `signal`
aborts requests; interrupting the Effect also aborts active fetch/body reads.

```ts
import { Effect } from "effect";
import { warmTrackEffect } from "@misofm/streaming/warm";

const program = warmTrackEffect(origin, quiltId, { concurrency: 4 });
await Effect.runPromise(program); // typed SdkError failures carry the original cause
```

`getMasterPlaylistUrl`, `warmTrack`, `preloadEngine`, and `openStream` are
player aliases for `masterPlaylistUrl`, `warm`, `preload`, and `open`.
`openStream`, `play`, and `destroy` are synchronous. Native `play()` invokes
the audio element immediately to preserve iOS user activation; MSE remembers
play intent until attachment. Load failures, fatal engine errors, and play
rejections call `onError`. `preloadEngine(onError)` optionally reports load
failure too, and a failed module load can be retried on the next call.
Opening another stream on the same element destroys the previous owner.
Destroy cancels pending startup and prevents late attachment or stale cleanup.

## License

Apache-2.0
