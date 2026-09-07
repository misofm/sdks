# @misofm/streaming

The `miso-hls/1` streaming transcode contract, as one dependency-free module.

A Miso streaming transcode is a fixed AAC-LC fMP4 ladder (96, 160, 256 kbps,
stereo, source sample rate) cut into aligned segments and packed into one
Walrus Quilt whose items are named by this contract. `@misofm/transcoder`
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

## License

Apache-2.0
