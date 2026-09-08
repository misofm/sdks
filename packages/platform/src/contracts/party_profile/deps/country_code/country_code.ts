/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * `CountryCode` — a validated ISO 3166-1 alpha-2 country code (e.g. "JP").
 *
 * A sibling to `language_code`: a tiny value primitive that parses a raw string
 * once, checking it against the officially-assigned alpha-2 set, and thereafter
 * carries a type that is provably a real country code. Consumers store
 * `CountryCode` (or `Option<CountryCode>` / `vector<CountryCode>`) and never
 * re-validate. The set lives in bytecode via a macro — no on-chain state.
 */

import { MoveTuple } from '../../../utils/index.ts';
import { bcs } from '@mysten/sui/bcs';
import type {} from "@mysten/bcs";
const $moduleName = 'country_code::country_code';
export const CountryCode = new MoveTuple({ name: `${$moduleName}::CountryCode`, fields: [bcs.string()] });