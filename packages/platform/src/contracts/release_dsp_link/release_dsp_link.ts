/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * Streaming deep links for a musicos release, one Digital Service Provider (DSP)
 * at a time. Attaches `DspLinkData` records to a `musicos::release::Release`: an
 * album-level link per DSP, plus an optional per-track link per DSP.
 *
 * `DspLinkData` is a single built-in enum with one variant per DSP, holding that
 * DSP's native identifier(s) — e.g. a Spotify album id, or Apple Music's
 * `(storefront, album_id, track_id)`. URLs are never stored: a client rebuilds the
 * public URL from the variant it reads back, so a DSP reshaping its URLs needs no
 * on-chain change. Storage is keyed by the variant's platform code (a `u8`
 * discriminant matching declaration order, via `platform()`), so each DSP occupies
 * its own independent dynamic field on the release's `UID` — adding or clearing
 * one DSP's link never touches another's.
 *
 * Two levels per DSP: the album-level link is the single `DspLinkData` stored
 * under `ReleaseLinkKey(platform)`; the per-track links are a
 * `PerTrack<Option<DspLinkData>>` stored under `TrackLinksKey(platform)` (one slot
 * per track, aligned to the tracklist by construction). A track whose slot is
 * `none` inherits the album-level link at the frontend.
 *
 * Streaming presence is presentation, not protocol-verifiable state, so it lives
 * on the release (the consumer object), not the recording. All writes are gated by
 * the `ReleaseAdminCap` via `uid_mut`; views are permissionless.
 */

import { MoveTuple, MoveStruct, MoveEnum, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import { type Transaction, type TransactionArgument } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/release_dsp_link::release_dsp_link';
export const ReleaseLinkKey = new MoveTuple({ name: `${$moduleName}::ReleaseLinkKey`, fields: [bcs.u8()] });
export const TrackLinksKey = new MoveTuple({ name: `${$moduleName}::TrackLinksKey`, fields: [bcs.u8()] });
export const ReleaseDspLinkSetEvent = new MoveStruct({ name: `${$moduleName}::ReleaseDspLinkSetEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        platform: bcs.u8(),
        track_count: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        previous_present: bcs.bool(),
        previous_fields: bcs.vector(bcs.vector(bcs.u8())),
        current_present: bcs.bool(),
        current_fields: bcs.vector(bcs.vector(bcs.u8()))
    } });
export const ReleaseDspLinkClearedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseDspLinkClearedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        platform: bcs.u8(),
        track_count: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        previous_present: bcs.bool(),
        previous_fields: bcs.vector(bcs.vector(bcs.u8())),
        current_present: bcs.bool(),
        current_fields: bcs.vector(bcs.vector(bcs.u8()))
    } });
export const ReleaseTrackDspLinkSetEvent = new MoveStruct({ name: `${$moduleName}::ReleaseTrackDspLinkSetEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        platform: bcs.u8(),
        track_count: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        track_index: bcs.u64(),
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        previous_present: bcs.bool(),
        previous_fields: bcs.vector(bcs.vector(bcs.u8())),
        current_present: bcs.bool(),
        current_fields: bcs.vector(bcs.vector(bcs.u8())),
        album_present: bcs.bool(),
        album_fields: bcs.vector(bcs.vector(bcs.u8()))
    } });
export const ReleaseTrackDspLinkClearedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseTrackDspLinkClearedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        platform: bcs.u8(),
        track_count: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        track_index: bcs.u64(),
        recording_id: bcs.Address,
        composition_id: bcs.Address,
        previous_present: bcs.bool(),
        previous_fields: bcs.vector(bcs.vector(bcs.u8())),
        current_present: bcs.bool(),
        current_fields: bcs.vector(bcs.vector(bcs.u8())),
        album_present: bcs.bool(),
        album_fields: bcs.vector(bcs.vector(bcs.u8()))
    } });
export const ReleaseTrackDspLinksClearedEvent = new MoveStruct({ name: `${$moduleName}::ReleaseTrackDspLinksClearedEvent`, fields: {
        release_id: bcs.Address,
        admin_cap_id: bcs.Address,
        platform: bcs.u8(),
        track_count: bcs.u64(),
        field_existed_before: bcs.bool(),
        field_exists_after: bcs.bool(),
        removed_link_count: bcs.u64(),
        removed_track_indices: bcs.vector(bcs.u64()),
        removed_recording_ids: bcs.vector(bcs.Address),
        removed_composition_ids: bcs.vector(bcs.Address),
        removed_link_fields: bcs.vector(bcs.vector(bcs.vector(bcs.u8()))),
        album_present: bcs.bool(),
        album_fields: bcs.vector(bcs.vector(bcs.u8()))
    } });
/**
 * A link to a release (or one of its tracks) on a single DSP, one variant per
 * platform. Which slot a value is stored in — the album-level slot or a per-track
 * slot — decides whether it addresses the release or one track; most DSPs use the
 * same identifier shape for both, which is why a variant doesn't carry an explicit
 * album/track flag.
 *
 * **Variant order is frozen.** Storage keys off `platform()`, a `u8` discriminant
 * matching declaration order (`Spotify = 0` … `YouTubeMusic =  7`). This immutable
 * package never changes those indices. Supporting another platform requires a new
 * immutable package identity and an explicit client/data migration; existing
 * variants are never reordered.
 */
export const DspLinkData = new MoveEnum({ name: `${$moduleName}::DspLinkData`, fields: {
        /**
          * Spotify addresses both albums and tracks by a single 22-char base62 id
          * (`open.spotify.com/album/{id}` or `/track/{id}`); album-vs-track is chosen by
          * where the link is stored, so one `id` field serves both.
          */
        Spotify: new MoveStruct({ name: `DspLinkData.Spotify`, fields: {
                id: bcs.string()
            } }),
        /**
         * Apple Music: an album is `music.apple.com/{storefront}/album/{album_id}`; a
         * track within it adds the `?i={track_id}` selector. `storefront` is the
         * two-letter region (e.g. `us`), and because a track link still needs the album
         * id, the album id is always present. The optional `track_id` distinguishes the
         * two forms — clients emit the track URL when it is set, the album URL otherwise.
         * The canonical web URL carries a cosmetic name slug (`/album/{slug}/{album_id}`);
         * only the trailing numeric `album_id` is stored, and Apple resolves the slug-less
         * form.
         */
        AppleMusic: new MoveStruct({ name: `DspLinkData.AppleMusic`, fields: {
                storefront: bcs.string(),
                album_id: bcs.string(),
                track_id: bcs.option(bcs.string())
            } }),
        /**
         * Amazon Music: an album is `music.amazon.com/albums/{album_id}`; a track within
         * it adds the `?trackAsin={track_id}` selector. Ids are ASINs (e.g. `B0064UPU4G`).
         * The optional `track_id` distinguishes the two forms — clients emit the track URL
         * when it is set, the album URL otherwise.
         */
        AmazonMusic: new MoveStruct({ name: `DspLinkData.AmazonMusic`, fields: {
                album_id: bcs.string(),
                track_id: bcs.option(bcs.string())
            } }),
        /**
         * Bandcamp addresses by artist subdomain + slug: an album is
         * `{subdomain}.bandcamp.com/album/{slug}` and a track is
         * `{subdomain}.bandcamp.com/track/{slug}`. Album-vs-track is chosen by where the
         * link is stored, so one `(subdomain, slug)` pair serves both.
         */
        Bandcamp: new MoveStruct({ name: `DspLinkData.Bandcamp`, fields: {
                subdomain: bcs.string(),
                slug: bcs.string()
            } }),
        /**
         * Deezer addresses albums and tracks by a numeric id (`www.deezer.com/album/{id}`
         * / `www.deezer.com/track/{id}`; a `/{locale}/` segment may appear but is
         * optional). Album-vs-track is chosen by where the link is stored, so one `id`
         * field serves both.
         */
        Deezer: new MoveStruct({ name: `DspLinkData.Deezer`, fields: {
                id: bcs.string()
            } }),
        /**
         * SoundCloud is slug-addressed, not numeric: an album/playlist is
         * `soundcloud.com/{user}/sets/{slug}` and a track is
         * `soundcloud.com/{user}/{slug}`. Album-vs-track is chosen by where the link is
         * stored, so one `(user, slug)` pair serves both.
         */
        SoundCloud: new MoveStruct({ name: `DspLinkData.SoundCloud`, fields: {
                user: bcs.string(),
                slug: bcs.string()
            } }),
        /**
         * Tidal addresses albums and tracks by a numeric id (`tidal.com/album/{id}` /
         * `tidal.com/track/{id}`; the older `tidal.com/browse/album/{id}` form also
         * resolves). Album-vs-track is chosen by where the link is stored, so one `id`
         * field serves both.
         */
        Tidal: new MoveStruct({ name: `DspLinkData.Tidal`, fields: {
                id: bcs.string()
            } }),
        /**
         * YouTube Music: an album is a playlist (`music.youtube.com/playlist?list={id}`)
         * and a track is a video (`music.youtube.com/watch?v={id}`). The `id` holds the
         * playlist id at the release level and the video id per track; album-vs-track is
         * chosen by where the link is stored, so one `id` field serves both.
         */
        YouTubeMusic: new MoveStruct({ name: `DspLinkData.YouTubeMusic`, fields: {
                id: bcs.string()
            } })
    } });
export interface PlatformArguments {
    self: TransactionArgument;
}
export interface PlatformOptions {
    package?: string;
    arguments: PlatformArguments | [
        self: TransactionArgument
    ];
}
/**
 * The link's platform code — the `u8` discriminant clients pass to
 * `clear_release_link`, `clear_track_link`, `clear_track_links`, and the view
 * functions below.
 */
export function platform(options: PlatformOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PlatformSpotifyOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `Spotify`. */
export function platformSpotify(options: PlatformSpotifyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_spotify',
    });
}
export interface PlatformAppleMusicOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `AppleMusic`. */
export function platformAppleMusic(options: PlatformAppleMusicOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_apple_music',
    });
}
export interface PlatformAmazonMusicOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `AmazonMusic`. */
export function platformAmazonMusic(options: PlatformAmazonMusicOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_amazon_music',
    });
}
export interface PlatformBandcampOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `Bandcamp`. */
export function platformBandcamp(options: PlatformBandcampOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_bandcamp',
    });
}
export interface PlatformDeezerOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `Deezer`. */
export function platformDeezer(options: PlatformDeezerOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_deezer',
    });
}
export interface PlatformSoundcloudOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `SoundCloud`. */
export function platformSoundcloud(options: PlatformSoundcloudOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_soundcloud',
    });
}
export interface PlatformTidalOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `Tidal`. */
export function platformTidal(options: PlatformTidalOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_tidal',
    });
}
export interface PlatformYoutubeMusicOptions {
    package?: string;
    arguments?: [
    ];
}
/** Platform code for `YouTubeMusic`. */
export function platformYoutubeMusic(options: PlatformYoutubeMusicOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'platform_youtube_music',
    });
}
export interface NewSpotifyArguments {
    id: RawTransactionArgument<string>;
}
export interface NewSpotifyOptions {
    package?: string;
    arguments: NewSpotifyArguments | [
        id: RawTransactionArgument<string>
    ];
}
/**
 * Builds a Spotify link from its id. Aborts if `id` is empty or exceeds
 * `MAX_SPOTIFY_ID_LENGTH`.
 */
export function newSpotify(options: NewSpotifyOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["id"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_spotify',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAppleMusicAlbumArguments {
    storefront: RawTransactionArgument<string>;
    albumId: RawTransactionArgument<string>;
}
export interface NewAppleMusicAlbumOptions {
    package?: string;
    arguments: NewAppleMusicAlbumArguments | [
        storefront: RawTransactionArgument<string>,
        albumId: RawTransactionArgument<string>
    ];
}
/**
 * Builds an Apple Music album link (no track selector). Aborts if `storefront` or
 * `album_id` is empty or exceeds its maximum length.
 */
export function newAppleMusicAlbum(options: NewAppleMusicAlbumOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["storefront", "albumId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_apple_music_album',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAppleMusicTrackArguments {
    storefront: RawTransactionArgument<string>;
    albumId: RawTransactionArgument<string>;
    trackId: RawTransactionArgument<string>;
}
export interface NewAppleMusicTrackOptions {
    package?: string;
    arguments: NewAppleMusicTrackArguments | [
        storefront: RawTransactionArgument<string>,
        albumId: RawTransactionArgument<string>,
        trackId: RawTransactionArgument<string>
    ];
}
/**
 * Builds an Apple Music track link — addresses `track_id` within its `album_id`.
 * Aborts if any identifier is empty or exceeds its maximum length.
 */
export function newAppleMusicTrack(options: NewAppleMusicTrackOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["storefront", "albumId", "trackId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_apple_music_track',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAmazonMusicAlbumArguments {
    albumId: RawTransactionArgument<string>;
}
export interface NewAmazonMusicAlbumOptions {
    package?: string;
    arguments: NewAmazonMusicAlbumArguments | [
        albumId: RawTransactionArgument<string>
    ];
}
/**
 * Builds an Amazon Music album link (no track selector). Aborts if `album_id` is
 * empty or exceeds `MAX_AMAZON_MUSIC_ALBUM_ID_LENGTH`.
 */
export function newAmazonMusicAlbum(options: NewAmazonMusicAlbumOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["albumId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_amazon_music_album',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewAmazonMusicTrackArguments {
    albumId: RawTransactionArgument<string>;
    trackId: RawTransactionArgument<string>;
}
export interface NewAmazonMusicTrackOptions {
    package?: string;
    arguments: NewAmazonMusicTrackArguments | [
        albumId: RawTransactionArgument<string>,
        trackId: RawTransactionArgument<string>
    ];
}
/**
 * Builds an Amazon Music track link — addresses `track_id` within its `album_id`.
 * Aborts if either ASIN is empty or exceeds its maximum length.
 */
export function newAmazonMusicTrack(options: NewAmazonMusicTrackOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["albumId", "trackId"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_amazon_music_track',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewBandcampArguments {
    subdomain: RawTransactionArgument<string>;
    slug: RawTransactionArgument<string>;
}
export interface NewBandcampOptions {
    package?: string;
    arguments: NewBandcampArguments | [
        subdomain: RawTransactionArgument<string>,
        slug: RawTransactionArgument<string>
    ];
}
/**
 * Builds a Bandcamp link. Aborts if `subdomain` or `slug` is empty or exceeds its
 * maximum length.
 */
export function newBandcamp(options: NewBandcampOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["subdomain", "slug"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_bandcamp',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewDeezerArguments {
    id: RawTransactionArgument<string>;
}
export interface NewDeezerOptions {
    package?: string;
    arguments: NewDeezerArguments | [
        id: RawTransactionArgument<string>
    ];
}
/**
 * Builds a Deezer link from its id. Aborts if `id` is empty or exceeds
 * `MAX_DEEZER_ID_LENGTH`.
 */
export function newDeezer(options: NewDeezerOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["id"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_deezer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewSoundcloudArguments {
    user: RawTransactionArgument<string>;
    slug: RawTransactionArgument<string>;
}
export interface NewSoundcloudOptions {
    package?: string;
    arguments: NewSoundcloudArguments | [
        user: RawTransactionArgument<string>,
        slug: RawTransactionArgument<string>
    ];
}
/**
 * Builds a SoundCloud link. Aborts if `user` or `slug` is empty or exceeds its
 * maximum length.
 */
export function newSoundcloud(options: NewSoundcloudOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String',
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["user", "slug"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_soundcloud',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewTidalArguments {
    id: RawTransactionArgument<string>;
}
export interface NewTidalOptions {
    package?: string;
    arguments: NewTidalArguments | [
        id: RawTransactionArgument<string>
    ];
}
/**
 * Builds a Tidal link from its id. Aborts if `id` is empty or exceeds
 * `MAX_TIDAL_ID_LENGTH`.
 */
export function newTidal(options: NewTidalOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["id"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_tidal',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewYoutubeMusicArguments {
    id: RawTransactionArgument<string>;
}
export interface NewYoutubeMusicOptions {
    package?: string;
    arguments: NewYoutubeMusicArguments | [
        id: RawTransactionArgument<string>
    ];
}
/**
 * Builds a YouTube Music link from its id. Aborts if `id` is empty or exceeds
 * `MAX_YOUTUBE_MUSIC_ID_LENGTH`.
 */
export function newYoutubeMusic(options: NewYoutubeMusicOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        '0x1::string::String'
    ] satisfies (string | null)[];
    const parameterNames = ["id"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'new_youtube_music',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetReleaseLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    link: TransactionArgument;
}
export interface SetReleaseLinkOptions {
    package?: string;
    arguments: SetReleaseLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        link: TransactionArgument
    ];
}
/**
 * Sets (or replaces) a DSP's album-level link. The platform is derived from `link`
 * itself. Per-track links are untouched.
 */
export function setReleaseLink(options: SetReleaseLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        null,
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "link"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'set_release_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearReleaseLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
}
export interface ClearReleaseLinkOptions {
    package?: string;
    arguments: ClearReleaseLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>
    ];
}
/** Clears a DSP's album-level link. No-op if unset. */
export function clearReleaseLink(options: ClearReleaseLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'clear_release_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface SetTrackLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    trackIndex: RawTransactionArgument<number | bigint>;
    link: TransactionArgument;
}
export interface SetTrackLinkOptions {
    package?: string;
    arguments: SetTrackLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        trackIndex: RawTransactionArgument<number | bigint>,
        link: TransactionArgument
    ];
}
/**
 * Sets (or replaces) a DSP's link for one track (by tracklist index). The platform
 * is derived from `link` itself. Aborts if the index is out of range.
 */
export function setTrackLink(options: SetTrackLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        null,
        'u64',
        null
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "trackIndex", "link"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'set_track_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearTrackLinkArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
    trackIndex: RawTransactionArgument<number | bigint>;
}
export interface ClearTrackLinkOptions {
    package?: string;
    arguments: ClearTrackLinkArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>,
        trackIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * Clears a DSP's link for one track (the track falls back to the album-level
 * link). No-op if no per-track array exists for this platform. Aborts if the index
 * is out of range (when an array exists).
 */
export function clearTrackLink(options: ClearTrackLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        null,
        'u8',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "platform", "trackIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'clear_track_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ClearTrackLinksArguments {
    self: RawTransactionArgument<string>;
    cap: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
}
export interface ClearTrackLinksOptions {
    package?: string;
    arguments: ClearTrackLinksArguments | [
        self: RawTransactionArgument<string>,
        cap: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>
    ];
}
/** Removes a DSP's entire per-track array. No-op if absent. */
export function clearTrackLinks(options: ClearTrackLinksOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "cap", "platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'clear_track_links',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasReleaseLinkArguments {
    self: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
}
export interface HasReleaseLinkOptions {
    package?: string;
    arguments: HasReleaseLinkArguments | [
        self: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>
    ];
}
/** Whether a DSP's album-level link is set. */
export function hasReleaseLink(options: HasReleaseLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'has_release_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReleaseLinkArguments {
    self: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
}
export interface ReleaseLinkOptions {
    package?: string;
    arguments: ReleaseLinkArguments | [
        self: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>
    ];
}
/** A DSP's album-level link, if set. */
export function releaseLink(options: ReleaseLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        'u8'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "platform"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'release_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TrackLinkArguments {
    self: RawTransactionArgument<string>;
    platform: RawTransactionArgument<number>;
    trackIndex: RawTransactionArgument<number | bigint>;
}
export interface TrackLinkOptions {
    package?: string;
    arguments: TrackLinkArguments | [
        self: RawTransactionArgument<string>,
        platform: RawTransactionArgument<number>,
        trackIndex: RawTransactionArgument<number | bigint>
    ];
}
/**
 * A DSP's link for one track, if set. An unset slot — or no array at all — yields
 * `none`, meaning the track inherits the album-level link. Aborts if the index is
 * out of range (when an array exists).
 */
export function trackLink(options: TrackLinkOptions) {
    const packageAddress = options.package ?? '@local-pkg/release_dsp_link';
    const argumentsTypes = [
        null,
        'u8',
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["self", "platform", "trackIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'release_dsp_link',
        function: 'track_link',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}