// Copyright (c) Miso Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { fromBase64 } from "@mysten/sui/utils";
import {
  getMisoPlatformDeployment,
  OperationsUnavailableError,
  RecordSalesUnavailableError,
  type OperationsDeployment,
} from "../src/deployments.ts";
import {
  deriveCompositionAdminCapId,
  deriveRecordingAdminCapId,
  deriveReleaseAdminCapId,
} from "@misofm/musicos";
import {
  assertAtomicPublicationBounds,
  inspectAtomicPublication,
  parseAtomicPublicationResult,
  publishAtomicCatalog,
  type AtomicPublicationParams,
} from "../src/publication.ts";
import { derivePressingAdminCapId, derivePressingId } from "../src/pressing.ts";
import * as contracts from "../src/contracts.ts";
import { party } from "@misofm/partyos/contracts";
import { derivePartyAdminCapId } from "@misofm/partyos";
import type { PlatformExecResult } from "../src/execute.ts";

const A = "0x" + "ab".repeat(32);
const RECORD_PACKAGE = "0x" + "bc".repeat(32);
const SHOP_PACKAGE = "0x" + "bd".repeat(32);
const SHARE_1 = "0x" + "11".repeat(32) + "::share::Share";
const SHARE_2 = "0x" + "22".repeat(32) + "::share::Share";
const id = (value: number) => `0x${value.toString(16).padStart(64, "0")}`;
const OPERATIONS = {
  status: "available",
  vault: { packageId: id(101), registryId: id(201) },
  actions: {
    compositionRoyaltyPool: id(102),
    recordingRoyaltyPool: id(103),
    partyWallet: id(104),
    compositionRoutedStake: id(105),
    releaseRevenueDistributor: id(106),
  },
  plugins: {
    compositionRoyaltyPool: id(107),
    recordingRoyaltyPool: id(108),
    releaseRevenueDistributor: id(109),
  },
} as const satisfies OperationsDeployment;

function params(): AtomicPublicationParams {
  return {
    deployment: {
      ...getMisoPlatformDeployment("testnet"),
      packages: {
        ...getMisoPlatformDeployment("testnet").packages,
        recordingStreamingTranscode: id(110),
        recordingEngineSession: id(111),
        recordingGenre: id(112),
      },
      recordSales: {
        status: "available",
        recordPackageId: RECORD_PACKAGE,
        recordShopPackageId: SHOP_PACKAGE,
      },
      operations: OPERATIONS,
    },
    parties: [
      {
        ref: "artist",
        create: "individual",
        name: "Artist",
        custody: { kind: "vault", owner: A },
      },
    ],
    compositions: [
      {
        ref: "c1",
        shareType: SHARE_1,
        shareCurrencyId: A,
        shareTreasuryCapId: A,
        title: "Composition",
        royaltyRateBps: 1_000,
        shareRecipients: [{ address: A, value: 10_000_000_000_000n }],
        shareDistribution: "stake",
        custody: { kind: "vault", owner: A },
        credits: [
          {
            party: "artist",
            displayName: "Artist",
            roles: [{ type: "Composer" }],
          },
        ],
        royaltyPool: { currencyType: "0x2::sui::SUI" },
      },
    ],
    recordings: [
      {
        ref: "r1",
        parentCompositionIndex: 0,
        shareType: SHARE_2,
        shareCurrencyId: A,
        shareTreasuryCapId: A,
        compositionShareType: SHARE_1,
        shareRecipients: [{ address: A, value: 9_000_000_000_000n }],
        shareDistribution: "stake",
        custody: { kind: "vault", owner: A },
        credits: [
          {
            party: "artist",
            displayName: "Artist",
            roles: [{ type: "Producer" }],
            primaryArtist: true,
          },
        ],
        royaltyPool: { currencyType: "0x2::sui::SUI" },
        routedStake: true,
        advisory: "Explicit",
        genres: [A],
        languages: { kind: "languages", codes: ["en"] },
        masterReferenceBlobId: 1n,
        streamingTranscodeQuiltId: 2n,
        engineSession: { sessionBlobId: 4n, stems: [{ digest: "ab".repeat(32), blobId: 5n }] },
      },
    ],
    release: {
      title: "Release",
      nonce: "1",
      tracks: [{ recordingIndex: 0, splitBps: 10_000 }],
      custody: { kind: "vault", owner: A },
      credits: [{ party: "artist", displayName: "Artist", role: "Primary" }],
      kind: "EP",
      description: "Description",
      genres: [A],
      cover: { stillBlobId: 3n },
      revenueDistribution: true,
    },
    pressing: {
      edition: 1,
      maxSupply: 1_000,
      listings: [
        {
          currencyType: "0x2::sui::SUI",
          price: { kind: "floor", amount: 1_000_000n },
        },
      ],
      custody: { kind: "vault", owner: A },
    },
  };
}

function calls(tx: Transaction): string[] {
  const data = tx.getData() as {
    commands: {
      $kind: string;
      MoveCall?: { module: string; function: string };
    }[];
  };
  return data.commands
    .filter((command) => command.$kind === "MoveCall" && command.MoveCall)
    .map(
      (command) => `${command.MoveCall!.module}::${command.MoveCall!.function}`,
    );
}

test("atomic publication includes the full graph, extensions, plugins, and custody", () => {
  const tx = new Transaction();
  const input = params();
  publishAtomicCatalog(input)(tx);
  const seq = calls(tx);
  const count = (value: string) => seq.filter((item) => item === value).length;

  expect(count("party::new")).toBe(1);
  expect(count("composition::new")).toBe(1);
  expect(count("recording::new")).toBe(1);
  expect(count("release::new")).toBe(1);
  expect(count("pressing::new")).toBe(1);
  expect(count("pressing::authorize_distributor")).toBe(1);
  expect(count("listing::new")).toBe(1);
  expect(count("listing::share")).toBe(1);
  expect(count("composition_credits::add_credit")).toBe(1);
  expect(count("recording_credits::add_credit")).toBe(1);
  expect(count("recording_credits::add_primary_artist")).toBe(1);
  expect(count("recording_advisory::set_rating")).toBe(1);
  expect(count("recording_language::set_languages")).toBe(1);
  expect(count("recording_master_reference::set_master_reference")).toBe(1);
  expect(count("recording_streaming_transcode::set_streaming_transcode")).toBe(1);
  expect(count("recording_engine_session::set_engine_session")).toBe(1);
  expect(count("release_credits::add_credit")).toBe(1);
  expect(count("release_kind::set_kind")).toBe(1);
  expect(count("release_description::set_description")).toBe(1);
  expect(count("release_genre::clear_genres")).toBe(1);
  expect(count("release_genre::add_genre")).toBe(1);
  expect(count("recording_genre::clear_genres")).toBe(1);
  expect(count("recording_genre::add_genre")).toBe(1);
  expect(count("release_cover_art::set_cover")).toBe(1);
  expect(count("composition_royalty_pool_plugin::install")).toBe(1);
  expect(count("composition_royalty_pool::new_pool")).toBe(1);
  expect(count("recording_royalty_pool_plugin::install")).toBe(1);
  expect(count("recording_royalty_pool::new_pool")).toBe(1);
  expect(count("composition_routed_stake::create_stake")).toBe(1);
  expect(count("composition_routed_stake::register")).toBe(1);
  expect(count("routed_stake::share")).toBe(1);
  expect(count("stake::new")).toBe(2);
  expect(count("pool::register_stake")).toBe(2);
  expect(count("pool::share")).toBe(2);
  expect(count("minato::disperse_balance")).toBe(0);
  expect(count("release_revenue_distributor_plugin::install")).toBe(1);
  expect(count("composition_routed_stake::install")).toBe(0);
  expect(count("party_wallet::install")).toBe(0);
  expect(count("vault::new")).toBe(5);
  expect(count("vault::share")).toBe(5);
  expect(tx.getData().commands.filter((command) => command.$kind === "TransferObjects")).toHaveLength(7);
  const recordingCapType = `${input.deployment.protocol.musicos}::recording::RecordingAdminCap<${SHARE_2}>`;
  const recordingVault = tx
    .getData()
    .commands.find(
      (command) =>
        command.$kind === "MoveCall" &&
        command.MoveCall.module === "vault" &&
        command.MoveCall.function === "new" &&
        command.MoveCall.typeArguments.includes(recordingCapType),
    );
  expect(recordingVault).toBeDefined();
  expect(seq.indexOf("release::new")).toBeLessThan(
    seq.indexOf("release::publish"),
  );
  expect(seq.indexOf("pressing::authorize_distributor")).toBeLessThan(
    seq.indexOf("listing::new"),
  );
  expect(seq.indexOf("listing::share")).toBeLessThan(
    seq.indexOf("pressing::share"),
  );
  expect(seq.indexOf("composition_royalty_pool::new_pool")).toBeLessThan(
    seq.indexOf("composition::publish"),
  );
  expect(seq.indexOf("recording_royalty_pool::new_pool")).toBeLessThan(
    seq.indexOf("recording::publish"),
  );
  expect(seq.indexOf("composition_routed_stake::register")).toBeLessThan(
    seq.indexOf("routed_stake::share"),
  );
  expect(seq.indexOf("composition_routed_stake::create_stake")).toBeLessThan(
    seq.indexOf("composition_routed_stake::register"),
  );
  expect(seq.indexOf("routed_stake::share")).toBeLessThan(
    seq.indexOf("pool::share", seq.indexOf("recording_royalty_pool::new_pool")),
  );
  expect(seq.indexOf("routed_stake::share")).toBeLessThan(
    seq.indexOf("recording::publish"),
  );
  expect(seq.indexOf("recording::publish")).toBeLessThan(
    seq.indexOf("composition::publish"),
  );

  const commands = tx.getData().commands as any[];
  const compositionIndex = commands.findIndex((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "composition" && command.MoveCall.function === "new"
  );
  const recordingIndex = commands.findIndex((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "recording" && command.MoveCall.function === "new"
  );
  const routed = commands.find((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "composition_routed_stake" && command.MoveCall.function === "create_stake"
  )!.MoveCall;
  const routedIndex = commands.findIndex((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "composition_routed_stake" && command.MoveCall.function === "create_stake"
  );
  expect(routed.arguments.slice(0, 3)).toEqual([
    { NestedResult: [compositionIndex, 0], $kind: "NestedResult" },
    { NestedResult: [compositionIndex, 1], $kind: "NestedResult" },
    { NestedResult: [recordingIndex, 0], $kind: "NestedResult" },
  ]);
  const valueInput = tx.getData().inputs[routed.arguments[3].Input] as any;
  expect(bcs.u64().parse(fromBase64(valueInput.Pure.bytes))).toBe("1000000000000");
  const recordingPoolIndex = commands.findIndex((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "recording_royalty_pool" && command.MoveCall.function === "new_pool"
  );
  const register = commands.find((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "composition_routed_stake" && command.MoveCall.function === "register"
  )!.MoveCall;
  expect(register.arguments).toEqual([
    { NestedResult: [compositionIndex, 0], $kind: "NestedResult" },
    { NestedResult: [compositionIndex, 1], $kind: "NestedResult" },
    { NestedResult: [recordingIndex, 0], $kind: "NestedResult" },
    { Result: routedIndex, $kind: "Result" },
    { Result: recordingPoolIndex, $kind: "Result" },
  ]);
  const share = commands.find((command) =>
    command.$kind === "MoveCall" && command.MoveCall.module === "routed_stake" && command.MoveCall.function === "share"
  )!.MoveCall;
  expect(share.arguments).toEqual([{ Result: routedIndex, $kind: "Result" }]);
});

test("recording genres require deployment.packages.recordingGenre", () => {
  const input = params();
  const withoutRecordingGenre: AtomicPublicationParams = {
    ...input,
    deployment: {
      ...input.deployment,
      packages: {
        ...input.deployment.packages,
        recordingGenre: undefined,
      },
    },
  };
  const tx = new Transaction();
  expect(() => publishAtomicCatalog(withoutRecordingGenre)(tx)).toThrow(
    /require deployment\.packages\.recordingGenre/,
  );
});

test("atomic publication is exactly assembled and checked before execution", () => {
  const inspected = inspectAtomicPublication(params());
  expect(inspected.commands).toBeGreaterThan(40);
  expect(inspected.inputs).toBeGreaterThan(10);
  expect(assertAtomicPublicationBounds(params())).toEqual(inspected);
});

test("unavailable operations reject Vault custody before adding any PTB command", () => {
  const input = params();
  const unavailable: AtomicPublicationParams = {
    ...input,
    deployment: {
      ...input.deployment,
      operations: {
        status: "unavailable",
        reason: "test deployment has no verified operations ABI",
      },
    },
  };
  const tx = new Transaction();
  expect(() => publishAtomicCatalog(unavailable)(tx)).toThrow(
    OperationsUnavailableError,
  );
  expect(tx.getData().commands).toHaveLength(0);
  expect(tx.getData().inputs).toHaveLength(0);
});

test("unavailable RecordSales rejects a direct-custody pressing before returning a thunk", () => {
  const input = params();
  const direct: AtomicPublicationParams = {
    ...input,
    deployment: {
      ...input.deployment,
      recordSales: {
        status: "unavailable",
        reason: "test deployment has no verified Record sales ABI",
      },
    },
    parties: input.parties.map((node) =>
      "create" in node
        ? { ...node, custody: { kind: "direct" as const, owner: A } }
        : node,
    ),
    compositions: input.compositions.map(({ royaltyPool: _, ...node }) => ({
      ...node,
      shareDistribution: "balance" as const,
      custody: { kind: "direct" as const, owner: A },
    })),
    recordings: input.recordings.map(({ royaltyPool: _, ...node }) => ({
      ...node,
      shareDistribution: "balance" as const,
      custody: { kind: "direct" as const, owner: A },
    })),
    release: input.release && {
      ...input.release,
      revenueDistribution: false,
      custody: { kind: "direct", owner: A },
    },
    pressing: input.pressing && {
      ...input.pressing,
      custody: { kind: "direct", owner: A },
    },
  };
  const tx = new Transaction();
  expect(() => publishAtomicCatalog(direct)).toThrow(
    RecordSalesUnavailableError,
  );
  expect(tx.getData().commands).toHaveLength(0);
  expect(tx.getData().inputs).toHaveLength(0);
});

test("streaming-transcode publication fails before PTB construction without its package identity", () => {
  const input = params();
  const deployment = {
    ...input.deployment,
    packages: {
      ...input.deployment.packages,
      recordingStreamingTranscode: undefined,
    },
  };
  expect(() => publishAtomicCatalog({ ...input, deployment })).toThrow(
    /deployment\.packages\.recordingStreamingTranscode/,
  );
});

test("engine-session publication fails before PTB construction without its package identity", () => {
  const input = params();
  const deployment = {
    ...input.deployment,
    packages: {
      ...input.deployment.packages,
      recordingEngineSession: undefined,
    },
  };
  expect(() => publishAtomicCatalog({ ...input, deployment })).toThrow(
    /deployment\.packages\.recordingEngineSession/,
  );
});

test("SDK callers can explicitly retain legacy balance dispersal", () => {
  const input = params();
  const balanced: AtomicPublicationParams = {
    ...input,
    compositions: input.compositions.map(
      ({ shareDistribution: _, ...node }) => node,
    ),
    recordings: input.recordings.map(
      ({ shareDistribution: _, routedStake: __, ...node }) => node,
    ),
  };
  const tx = new Transaction();
  publishAtomicCatalog(balanced)(tx);
  const seq = calls(tx);
  expect(
    seq.filter((call) => call === "minato::disperse_balance"),
  ).toHaveLength(2);
  expect(seq.filter((call) => call === "stake::new")).toHaveLength(0);
  expect(
    seq.filter((call) => call.endsWith("_royalty_pool::new_pool")),
  ).toHaveLength(2);
});

test("Vault-only publication features reject direct custody", () => {
  const input = params();
  const direct: AtomicPublicationParams = {
    ...input,
    compositions: input.compositions.map((node, index) =>
      index === 0 ? { ...node, custody: { kind: "direct", owner: A } } : node,
    ),
  };
  expect(() => publishAtomicCatalog(direct)).toThrow(
    /permissionless royalty cranks require Vault custody/,
  );
});

test("routed stakes require fresh parents and matching royalty pools", () => {
  const input = params();
  const recording = input.recordings[0]!;
  expect(() => publishAtomicCatalog({
    ...input,
    recordings: [{
      ...recording,
      parentCompositionIndex: undefined,
      parentCompositionId: A,
    }],
  })).toThrow(/fresh parent Composition/);
  expect(() => publishAtomicCatalog({
    ...input,
    recordings: [{
      ...recording,
      royaltyPool: { currencyType: "0x2::coin::COIN" },
    }],
  })).toThrow(/same currency type/);
  expect(() => publishAtomicCatalog({
    ...input,
    recordings: input.recordings.map((recording) => ({
      ...recording,
      shareDistribution: "balance" as const,
    })),
  })).toThrow(/Recording stake distribution/);
  expect(() => publishAtomicCatalog({
    ...input,
    compositions: input.compositions.map((composition) => ({
      ...composition,
      shareDistribution: "balance" as const,
    })),
  })).toThrow(/parent Composition stake distribution/);
  expect(() => publishAtomicCatalog({
    ...input,
    compositions: input.compositions.map((composition) => ({
      ...composition,
      royaltyRateBps: 0,
    })),
  })).toThrow(/royaltyRateBps from 1 to 9999/);
});

test("atomic result parsing maps canonical Vault events without requiring top-level cap effects", () => {
  const input: AtomicPublicationParams = {
    ...params(),
    parties: [{ ref: "artist", create: "individual", name: "Artist", custody: { kind: "vault", owner: A } }],
  };
  const deployment = input.deployment;
  const compositionId = "0x" + "31".repeat(32);
  const recordingId = "0x" + "32".repeat(32);
  const releaseId = "0x" + "33".repeat(32);
  const compositionPoolId = "0x" + "34".repeat(32);
  const recordingPoolId = "0x" + "35".repeat(32);
  const routedStakeId = "0x" + "36".repeat(32);
  const partyId = "0x" + "37".repeat(32);
  const partyCapId = derivePartyAdminCapId(partyId, deployment.partyos.partyos);
  const compositionCapId = deriveCompositionAdminCapId(
    compositionId,
    deployment.protocol.musicos,
  );
  const recordingCapId = deriveRecordingAdminCapId(
    recordingId,
    deployment.protocol.musicos,
  );
  const releaseCapId = deriveReleaseAdminCapId(
    releaseId,
    deployment.protocol.musicos,
  );
  const sales =
    deployment.recordSales.status === "available"
      ? deployment.recordSales
      : null;
  if (!sales) throw new Error("test requires Record sales");
  const pressingId = derivePressingId(
    releaseId,
    input.pressing!.edition,
    sales.recordPackageId,
  );
  const pressingCapId = derivePressingAdminCapId(
    pressingId,
    sales.recordPackageId,
  );
  const wrappedCaps = [
    partyCapId,
    compositionCapId,
    recordingCapId,
    releaseCapId,
    pressingCapId,
  ];
  const vaultIds = wrappedCaps.map(
    (_, index) => `0x${(65 + index).toString(16).repeat(64).slice(0, 64)}`,
  );
  const events = wrappedCaps.map((wrappedCapId, index) => ({
    eventType: `${OPERATIONS.vault.packageId}::vault::VaultCreatedEvent<0x1::cap::Cap>`,
    bcs: contracts.vault.VaultCreatedEvent.serialize({
      registry_id: OPERATIONS.vault.registryId,
      vault_id: vaultIds[index]!,
      cap_id: wrappedCapId,
      admin_cap_id: `0x${(80 + index).toString(16).repeat(64).slice(0, 64)}`,
      authorized_plugins_id: `0x${(90 + index).toString(16).repeat(64).slice(0, 64)}`,
      authorized_plugin_count: "0",
      active: true,
      capability_available: true,
    }).toBytes(),
  }));
  events.push({
    eventType: `${deployment.partyos.partyos}::party::PartyCreatedEvent`,
    bcs: party.PartyCreatedEvent.serialize({
      party_id: partyId,
      admin_cap_id: partyCapId,
      name: "Artist",
      kind: 0,
      member_ids: [],
      creator: A,
      created_at_ms: "9007199254740993",
      created_epoch: "17",
    }).toBytes(),
  });
  const objectTypes: Record<string, string> = {
    [compositionId]: `${deployment.protocol.musicos}::composition::Composition<${SHARE_1}>`,
    [recordingId]: `${deployment.protocol.musicos}::recording::Recording<${SHARE_2},${SHARE_1}>`,
    [releaseId]: `${deployment.protocol.musicos}::release::Release`,
    [compositionPoolId]: `${deployment.packages.royaltyPool}::pool::RoyaltyPool<${SHARE_1},0x2::sui::SUI>`,
    [recordingPoolId]: `${deployment.packages.royaltyPool}::pool::RoyaltyPool<${SHARE_2},0x2::sui::SUI>`,
    [routedStakeId]: `${deployment.packages.routedStake}::routed_stake::RoutedStake<${SHARE_2},${SHARE_1}>`,
  };
  const result = {
    digest: "digest",
    gasUsed: 7,
    objectTypes,
    changedObjects: Object.keys(objectTypes).map((objectId) => ({
      objectId,
      idOperation: "Created",
      outputState: "ObjectWrite",
    })),
    balanceChanges: [],
    events,
  } as unknown as PlatformExecResult;

  const parsed = parseAtomicPublicationResult(input, result);
  expect(parsed.compositions.c1).toMatchObject({
    id: compositionId,
    adminCapId: compositionCapId,
    royaltyPoolId: compositionPoolId,
  });
  expect(parsed.recordings.r1).toMatchObject({
    id: recordingId,
    adminCapId: recordingCapId,
    royaltyPoolId: recordingPoolId,
    routedStakeId,
  });
  expect(parsed.release).toMatchObject({
    id: releaseId,
    adminCapId: releaseCapId,
  });
  expect(parsed.pressing).toMatchObject({
    id: pressingId,
    adminCapId: pressingCapId,
  });
  expect(parsed.recordings.r1!.authority).toMatchObject({
    kind: "vault",
    vaultId: vaultIds[2],
  });
});
