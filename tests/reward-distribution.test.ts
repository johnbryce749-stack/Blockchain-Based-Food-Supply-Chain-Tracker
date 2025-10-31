import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cl } from "@stacks/transactions";
import type { ClarityValue } from "@stacks/transactions";

interface Verification {
  submitter: string;
  approved: boolean;
  category: string;
  timestamp: bigint;
}

interface MockState {
  treasury: bigint;
  currentCycle: bigint;
  lastCycleUpdate: bigint;
  baseReward: bigint;
  claimed: Map<string, boolean>;
  verifications: Map<bigint, Verification>;
  multipliers: Map<string, bigint>;
}

class RewardDistributionMock {
  state: MockState;
  caller: string;
  blockHeight: bigint;
  owner: string;
  verificationContract: string;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      treasury: 0n,
      currentCycle: 0n,
      lastCycleUpdate: 0n,
      baseReward: 1000n,
      claimed: new Map(),
      verifications: new Map(),
      multipliers: new Map([["organic", 150n], ["sustainable", 120n], ["regenerative", 200n]]),
    };
    this.caller = "ST1USER";
    this.blockHeight = 100n;
    this.owner = "ST1OWNER";
    this.verificationContract = "ST1VERIF";
  }

  advanceBlocks(blocks: bigint) {
    this.blockHeight += blocks;
  }

  setCaller(principal: string) {
    this.caller = principal;
  }

  getTreasuryBalance(): { ok: true; value: bigint } {
    return { ok: true, value: this.state.treasury };
  }

  setBaseReward(amount: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.owner) return { ok: false, value: false };
    if (amount <= 0n) return { ok: false, value: false };
    this.state.baseReward = amount;
    return { ok: true, value: true };
  }

  setCategoryMultiplier(category: string, multiplier: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.owner) return { ok: false, value: false };
    if (multiplier < 50n || multiplier > 300n) return { ok: false, value: false };
    this.state.multipliers.set(category, multiplier);
    return { ok: true, value: true };
  }

  registerVerification(
    verifId: bigint,
    submitter: string,
    category: string,
    approved: boolean
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.verificationContract) return { ok: false, value: false };
    if (!this.state.multipliers.has(category)) return { ok: false, value: false };
    this.state.verifications.set(verifId, {
      submitter,
      approved,
      category,
      timestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  depositTreasury(amount: bigint): { ok: boolean; value: boolean } {
    if (amount <= 0n) return { ok: false, value: false };
    this.state.treasury += amount;
    return { ok: true, value: true };
  }

  claimReward(verifId: bigint): { ok: boolean; value: bigint } | { ok: false; value: number } {
    const verif = this.state.verifications.get(verifId);
    if (!verif) return { ok: false, value: 101 };
    if (this.caller !== verif.submitter) return { ok: false, value: 100 };
    if (!verif.approved) return { ok: false, value: 104 };
    const key = `${verifId}-${this.caller}`;
    if (this.state.claimed.get(key)) return { ok: false, value: 102 };
    if (this.blockHeight - verif.timestamp < 144n) return { ok: false, value: 109 };

    const multiplier = this.state.multipliers.get(verif.category) ?? 100n;
    const reward = this.state.baseReward * multiplier / 100n;
    if (reward > 5000000n) return { ok: false, value: 107 };
    if (this.state.treasury < reward) return { ok: false, value: 106 };

    this.state.treasury -= reward;
    this.state.claimed.set(key, true);
    return { ok: true, value: reward };
  }

  getVerification(verifId: bigint): Verification | null {
    return this.state.verifications.get(verifId) ?? null;
  }

  getMultiplier(category: string): bigint {
    return this.state.multipliers.get(category) ?? 100n;
  }
}

describe("reward-distribution.clar", () => {
  let mock: RewardDistributionMock;

  beforeEach(() => {
    mock = new RewardDistributionMock();
    mock.reset();
  });

  it("should allow owner to set base reward", () => {
    mock.setCaller(mock.owner);
    const result = mock.setBaseReward(2000n);
    expect(result).toEqual({ ok: true, value: true });
    expect(mock.state.baseReward).toBe(2000n);
  });

  it("should reject non-owner setting base reward", () => {
    const result = mock.setBaseReward(2000n);
    expect(result).toEqual({ ok: false, value: false });
  });

  it("should set category multiplier within bounds", () => {
    mock.setCaller(mock.owner);
    const result = mock.setCategoryMultiplier("biodynamic", 180n);
    expect(result).toEqual({ ok: true, value: true });
    expect(mock.getMultiplier("biodynamic")).toBe(180n);
  });

  it("should reject multiplier outside 50-300 range", () => {
    mock.setCaller(mock.owner);
    const result = mock.setCategoryMultiplier("invalid", 400n);
    expect(result).toEqual({ ok: false, value: false });
  });

  it("should register verification from authorized contract", () => {
    mock.setCaller(mock.verificationContract);
    const result = mock.registerVerification(1n, "ST1USER", "organic", true);
    expect(result).toEqual({ ok: true, value: true });
    const verif = mock.getVerification(1n);
    expect(verif?.category).toBe("organic");
    expect(verif?.approved).toBe(true);
  });

  it("should reject verification from unauthorized caller", () => {
    const result = mock.registerVerification(1n, "ST1USER", "organic", true);
    expect(result).toEqual({ ok: false, value: false });
  });

  it("should deposit into treasury", () => {
    const result = mock.depositTreasury(10000n);
    expect(result).toEqual({ ok: true, value: true });
    expect(mock.getTreasuryBalance().value).toBe(10000n);
  });

  it("should successfully claim reward after approval and cooldown", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(1n, "ST1USER", "regenerative", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(200n);

    mock.depositTreasury(100000n);
    const result = mock.claimReward(1n);
    const expectedReward = 1000n * 200n / 100n; // base * multiplier
    expect(result).toEqual({ ok: true, value: expectedReward });
    expect(mock.state.treasury).toBe(100000n - expectedReward);
  });

  it("should prevent double claim", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(2n, "ST1USER", "organic", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(150n);
    mock.depositTreasury(50000n);

    mock.claimReward(2n);
    const second = mock.claimReward(2n);
    expect(second).toEqual({ ok: false, value: 102 });
  });

  it("should enforce cooldown period", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(3n, "ST1USER", "sustainable", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(50n); // less than 144
    mock.depositTreasury(10000n);

    const result = mock.claimReward(3n);
    expect(result).toEqual({ ok: false, value: 109 });
  });

  it("should reject claim if treasury insufficient", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(4n, "ST1USER", "regenerative", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(200n);
    mock.depositTreasury(1000n); // less than reward

    const result = mock.claimReward(4n);
    expect(result).toEqual({ ok: false, value: 106 });
  });

  it("should reject unapproved verification", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(5n, "ST1USER", "organic", false);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(200n);
    mock.depositTreasury(10000n);

    const result = mock.claimReward(5n);
    expect(result).toEqual({ ok: false, value: 104 });
  });

  it("should apply correct multiplier per category", () => {
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(6n, "ST1USER", "regenerative", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(200n);
    mock.depositTreasury(100000n);

    const result = mock.claimReward(6n) as { ok: true; value: bigint };
    expect(result.value).toBe(2000n); // 1000 * 200%
  });

  it("should cap reward at cycle limit", () => {
    mock.setCaller(mock.owner);
    mock.setBaseReward(10000000n); // very high
    mock.setCaller(mock.verificationContract);
    mock.registerVerification(7n, "ST1USER", "regenerative", true);
    mock.setCaller("ST1USER");
    mock.advanceBlocks(200n);
    mock.depositTreasury(10000000n);

    const result = mock.claimReward(7n);
    expect(result).toEqual({ ok: false, value: 107 });
  });
});