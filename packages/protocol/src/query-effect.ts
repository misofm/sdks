// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
export { workflow as queryEffect } from "@misofm/utils/effect";

export function nextPageCursor(hasNextPage: boolean | undefined, next: string | null | undefined, previous: string | null | undefined): string | null {
  if (!hasNextPage) return null;
  if (!next || next === previous) throw new Error("Pagination did not advance its cursor");
  return next;
}
