/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * An audio file with self-attested technical metadata — a standalone, wrapped
 * primitive that any protocol can embed (e.g. as a recording's master).
 *
 * ### Key Features:
 *
 * - Format (codec/container, e.g. `flac`) and PCM parameters (channels, bit depth,
 *   sample rate, samples)
 * - Walrus blob ID for storage reference
 * - Permissionless creation from caller-supplied metadata via `new`. Metadata is
 *   structurally validated; blob contents and PCM digests are not verified.
 */

import { MoveStruct } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
import * as data from '../ori/data.ts';
const $moduleName = 'audio::audio';
export const Audio = new MoveStruct({ name: `${$moduleName}::Audio`, fields: {
        /**
           * Codec/container of the stored blob, as a bare lowercase short name (e.g. `flac`,
           * `wav`, `opus`). No `audio/` prefix — the type is already audio.
           */
        format: bcs.string(),
        /** Number of audio channels (1 = mono, 2 = stereo). */
        channels: bcs.u8(),
        /** Bits per sample (8, 16, 24, or 32). */
        bit_depth: bcs.u8(),
        /**
         * Supported integer PCM sample rate in hertz (44.1/48 kHz families through 384
         * kHz).
         */
        sample_rate_hz: bcs.u32(),
        /** Total number of PCM samples in the audio. */
        samples: bcs.u64(),
        /**
         * Unkeyed BLAKE3 digest of the canonical decoded PCM (codec-independent content
         * fingerprint), using the default 32-byte output.
         */
        pcm_digest: bcs.vector(bcs.u8()),
        /** Standalone Walrus blob reference for the audio. */
        data: data.WalrusBlob
    } });