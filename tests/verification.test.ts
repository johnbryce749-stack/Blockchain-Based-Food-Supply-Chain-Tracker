import { describe, it, expect, beforeEach } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

interface Proof {
  submitter: string;
  category: string;
  location: string;
  evidenceHash: string;
  timestamp: bigint;
  status: string;
  score: bigint;
  expiry: bigint;
  closed: boolean;
}

interface Verification {
  approved: boolean;
  timestamp: bigint;
  confidence: bigint;
}

interface Verifier {
  registered: boolean;
  stake: bigint;
  reputation: bigint;
  activeProofs: bigint;
  lastActivity: bigint;
}

interface MockState {
  nextProofId: bigint;
  proofs: Map<bigint, Proof>;
  verifications: Map<string, Verification>;
  verifiers: Map<string, Verifier>;
  userSubmissions: Map<string, bigint>;
  blockedUsers: Map<string, boolean>;
  authority: string;
  stxTransfers: Array<{ amount: bigint; from: string; to: string }>;
}

class VerificationContractMock {
  state: MockState;
  currentCaller: string;
  blockHeight: bigint;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProofId: 1n,
      proofs: new Map(),
      verifications: new Map(),
      verifiers: new Map(),
      userSubmissions: new Map(),
      blockedUsers: new Map(),
      authority: "ST1AUTHORITY",
      stxTransfers: [],
    };
    this.currentCaller = "ST1FARMER";
    this.blockHeight = 1000n;
  }

  private getKey(proofId: bigint, verifier: string): string {
    return `${proofId.toString()}-${verifier}`;
  }

  private validateCategory(cat: string): boolean {
    return ["organic", "carbon-neutral", "water-efficient", "biodiversity", "fair-trade"].includes(cat);
  }

  private validateEvidence(hash: string): boolean {
    return hash !== "0".repeat(64);
  }

  private validateLocation(loc: string): boolean {
    return loc.length > 0 && loc.length <= 100;
  }

  private validateScore(score: bigint): boolean {
    return score >= 0n && score <= 100n;
  }

  private hasQuorum(proofId: bigint): boolean {
    const verifs = Array.from(this.state.verifications.entries())
      .filter(([k]) => k.startsWith(proofId.toString()))
      .map(([, v]) => v);
    const approvals = verifs.filter(v => v.approved);
    return approvals.length >= 3;
  }

  private calculateScore(proofId: bigint): bigint {
    const verifs = Array.from(this.state.verifications.entries())
      .filter(([k]) => k.startsWith(proofId.toString()))
      .map(([, v]) => v);
    const approved = verifs.filter(v => v.approved);
    if (approved.length === 0) return 0n;
    const sum = approved.reduce((acc, v) => acc + v.confidence, 0n);
    return (sum * 100n) / (BigInt(approved.length) * 100n);
  }

  registerVerifier(): { type: ClarityType; value: boolean } {
    const user = this.currentCaller;
    if (this.state.verifiers.has(user)) {
      return { type: ClarityType.ResponseErr, value: 300n };
    }
    this.state.verifiers.set(user, {
      registered: true,
      stake: 0n,
      reputation: 50n,
      activeProofs: 0n,
      lastActivity: this.blockHeight,
    });
    return { type: ClarityType.ResponseOk, value: true };
  }

  stakeForVerification(amount: bigint): { type: ClarityType; value: bigint | bigint } {
    const user = this.currentCaller;
    const verifier = this.state.verifiers.get(user);
    if (!verifier) return { type: ClarityType.ResponseErr, value: 109n };
    if (amount <= 0n) return { type: ClarityType.ResponseErr, value: 116n };
    this.state.stxTransfers.push({ amount, from: user, to: "contract" });
    const newStake = verifier.stake + amount;
    this.state.verifiers.set(user, { ...verifier, stake: newStake, lastActivity: this.blockHeight });
    return { type: ClarityType.ResponseOk, value: newStake };
  }

  submitProof(category: string, location: string, evidenceHash: string): { type: ClarityType; value: bigint | bigint } {
    const user = this.currentCaller;
    if (this.state.blockedUsers.has(user)) return { type: ClarityType.ResponseErr, value: 110n };
    const submissions = this.state.userSubmissions.get(user) || 0n;
    if (submissions >= 50n) return { type: ClarityType.ResponseErr, value: 111n };
    if (!this.validateCategory(category)) return { type: ClarityType.ResponseErr, value: 113n };
    if (!this.validateLocation(location)) return { type: ClarityType.ResponseErr, value: 114n };
    if (!this.validateEvidence(evidenceHash)) return { type: ClarityType.ResponseErr, value: 108n };

    const proofId = this.state.nextProofId;
    const expiry = this.blockHeight + 52560n;

    this.state.proofs.set(proofId, {
      submitter: user,
      category,
      location,
      evidenceHash,
      timestamp: this.blockHeight,
      status: "pending",
      score: 0n,
      expiry,
      closed: false,
    });
    this.state.userSubmissions.set(user, submissions + 1n);
    this.state.nextProofId += 1n;

    return { type: ClarityType.ResponseOk, value: proofId };
  }

  verifyProof(proofId: bigint, approved: boolean, confidence: bigint): { type: ClarityType; value: boolean | bigint } {
    const verifier = this.currentCaller;
    const v = this.state.verifiers.get(verifier);
    if (!v || v.stake < 1000000n) return { type: ClarityType.ResponseErr, value: 116n };
    const proof = this.state.proofs.get(proofId);
    if (!proof) return { type: ClarityType.ResponseErr, value: 102n };
    if (proof.closed) return { type: ClarityType.ResponseErr, value: 119n };
    if (this.blockHeight > proof.expiry) return { type: ClarityType.ResponseErr, value: 107n };
    if (!this.validateScore(confidence)) return { type: ClarityType.ResponseErr, value: 115n };

    const key = this.getKey(proofId, verifier);
    if (this.state.verifications.has(key)) return { type: ClarityType.ResponseErr, value: 300n };

    this.state.verifications.set(key, { approved, timestamp: this.blockHeight, confidence });
    this.state.verifiers.set(verifier, { ...v, activeProofs: v.activeProofs + 1n, lastActivity: this.blockHeight });

    if (approved && this.hasQuorum(proofId)) {
      const score = this.calculateScore(proofId);
      this.state.proofs.set(proofId, { ...proof, status: "approved", score, closed: true });
      const submitterRep = this.state.verifiers.get(proof.submitter) || { reputation: 50n };
      this.state.verifiers.set(proof.submitter, { ...submitterRep, reputation: BigInt(Math.min(100, Number(submitterRep.reputation) + 10)) });
    }

    return { type: ClarityType.ResponseOk, value: true };
  }

  rejectProof(proofId: bigint, reason: string): { type: ClarityType; value: boolean | bigint } {
    const verifier = this.currentCaller;
    const v = this.state.verifiers.get(verifier);
    if (!v || v.stake < 1000000n) return { type: ClarityType.ResponseErr, value: 116n };
    const proof = this.state.proofs.get(proofId);
    if (!proof || proof.status !== "pending") return { type: ClarityType.ResponseErr, value: 105n };

    this.state.proofs.set(proofId, { ...proof, status: "rejected", closed: true });
    const submitterRep = this.state.verifiers.get(proof.submitter) || { reputation: 50n };
    this.state.verifiers.set(proof.submitter, { ...submitterRep, reputation: BigInt(Math.max(0, Number(submitterRep.reputation) - 5)) });

    return { type: ClarityType.ResponseOk, value: true };
  }
}

describe("verification.clar", () => {
  let mock: VerificationContractMock;

  beforeEach(() => {
    mock = new VerificationContractMock();
    mock.reset();
  });

  it("registers a verifier successfully", () => {
    const result = mock.registerVerifier();
    expect(result.type).toBe(ClarityType.ResponseOk);
    expect(mock.state.verifiers.get("ST1FARMER")?.registered).toBe(true);
  });

  it("prevents double registration", () => {
    mock.registerVerifier();
    const result = mock.registerVerifier();
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("allows staking for verification", () => {
    mock.registerVerifier();
    const result = mock.stakeForVerification(2000000n);
    expect(result.type).toBe(ClarityType.ResponseOk);
    expect(mock.state.verifiers.get("ST1FARMER")?.stake).toBe(2000000n);
  });

  it("rejects stake from non-registered verifier", () => {
    const result = mock.stakeForVerification(1000000n);
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("submits a valid proof", () => {
    const result = mock.submitProof("organic", "Farm A, Kenya", "a".repeat(64));
    expect(result.type).toBe(ClarityType.ResponseOk);
    expect(result.value).toBe(1n);
    const proof = mock.state.proofs.get(1n);
    expect(proof?.category).toBe("organic");
    expect(proof?.status).toBe("pending");
  });

  it("rejects invalid category", () => {
    const result = mock.submitProof("invalid", "Farm", "a".repeat(64));
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("rejects zero evidence hash", () => {
    const result = mock.submitProof("organic", "Farm", "0".repeat(64));
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("enforces submission limit", () => {
    for (let i = 0; i < 50; i++) {
      mock.submitProof("organic", `Farm ${i}`, "a".repeat(64));
    }
    const result = mock.submitProof("organic", "Farm 50", "a".repeat(64));
    expect(result.type).toBe(ClarityType.ResponseErr);
  });

  it("rejects proof and deducts reputation", () => {
    mock.registerVerifier();
    mock.stakeForVerification(2000000n);
    mock.currentCaller = "ST1FARMER";
    const submit = mock.submitProof("organic", "Farm", "a".repeat(64));
    const proofId = submit.value as bigint;

    mock.currentCaller = "ST1FARMER";
    mock.registerVerifier();
    mock.stakeForVerification(2000000n);
    const result = mock.rejectProof(proofId, "Fake evidence");

    expect(result.type).toBe(ClarityType.ResponseOk);
    const proof = mock.state.proofs.get(proofId);
    expect(proof?.status).toBe("rejected");
  });

  it("blocks expired proofs", () => {
    mock.registerVerifier();
    mock.stakeForVerification(2000000n);
    mock.currentCaller = "ST1FARMER";
    const submit = mock.submitProof("organic", "Farm", "a".repeat(64));
    const proofId = submit.value as bigint;

    mock.blockHeight = 100000n;
    mock.currentCaller = "ST1FARMER";
    const result = mock.verifyProof(proofId, true, 90n);
    expect(result.type).toBe(ClarityType.ResponseErr);
  });
});