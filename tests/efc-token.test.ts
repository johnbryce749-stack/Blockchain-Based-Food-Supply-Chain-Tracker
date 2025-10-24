import { describe, it, expect, beforeEach } from "vitest";

interface TokenState {
  totalSupply: bigint;
  totalMinted: bigint;
  mintEnabled: boolean;
  burnEnabled: boolean;
  paused: boolean;
  maxSupply: bigint;
  owner: string;
  balances: Map<string, bigint>;
  whitelistedMinters: Set<string>;
  blacklisted: Set<string>;
}

class EFCTokenMock {
  state: TokenState;
  caller: string;
  blockHeight: number;

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      totalSupply: BigInt(0),
      totalMinted: BigInt(0),
      mintEnabled: true,
      burnEnabled: true,
      paused: false,
      maxSupply: BigInt(1000000000),
      owner: "ST1OWNER",
      balances: new Map(),
      whitelistedMinters: new Set(),
      blacklisted: new Set(),
    };
    this.caller = "ST1OWNER";
    this.blockHeight = 100;
  }

  private assertOwner() {
    if (this.caller !== this.state.owner) throw new Error("100");
  }

  private assertNotPaused() {
    if (this.state.paused) throw new Error("108");
  }

  private assertValidAmount(amount: bigint) {
    if (amount <= BigInt(0)) throw new Error("102");
  }

  private assertNotBlacklisted(addr: string) {
    if (this.state.blacklisted.has(addr)) throw new Error("109");
  }

  private assertNotZeroAddress(addr: string) {
    if (addr === "SP000000000000000000002Q6VF78" || addr === "ST000000000000000000002AMW42H") {
      throw new Error(addr === this.caller ? "107" : "106");
    }
  }

  getName() {
    return { ok: true, value: "EcoFoodChain Token" };
  }

  getSymbol() {
    return { ok: true, value: "EFC" };
  }

  getDecimals() {
    return { ok: true, value: BigInt(6) };
  }

  getTotalSupply() {
    return { ok: true, value: this.state.totalSupply };
  }

  getMaxSupply() {
    return { ok: true, value: this.state.maxSupply };
  }

  getTotalMinted() {
    return { ok: true, value: this.state.totalMinted };
  }

  getBalance(account: string): { ok: boolean; value: bigint } {
    return { ok: true, value: this.state.balances.get(account) || BigInt(0) };
  }

  isMintEnabled() {
    return { ok: true, value: this.state.mintEnabled };
  }

  isBurnEnabled() {
    return { ok: true, value: this.state.burnEnabled };
  }

  isPaused() {
    return { ok: true, value: this.state.paused };
  }

  isWhitelistedMinter(minter: string) {
    return { ok: true, value: this.state.whitelistedMinters.has(minter) };
  }

  isBlacklisted(account: string) {
    return { ok: true, value: this.state.blacklisted.has(account) };
  }

  getTokenUri() {
    return { ok: true, value: { type: 9, value: { type: 6, value: BigInt(0) } } };
  }

  transfer(amount: bigint, sender: string, recipient: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertNotPaused();
      this.assertValidAmount(amount);
      if (this.caller !== sender) throw new Error("100");
      const balance = this.state.balances.get(sender) || BigInt(0);
      if (balance < amount) throw new Error("101");
      this.assertNotBlacklisted(sender);
      this.assertNotBlacklisted(recipient);
      this.assertNotZeroAddress(sender);
      this.assertNotZeroAddress(recipient);
      this.state.balances.set(sender, balance - amount);
      this.state.balances.set(recipient, (this.state.balances.get(recipient) || BigInt(0)) + amount);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  mint(amount: bigint, recipient: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      if (!this.state.mintEnabled) throw new Error("103");
      if (this.caller !== this.state.owner && !this.state.whitelistedMinters.has(this.caller)) throw new Error("100");
      this.assertValidAmount(amount);
      const newTotal = this.state.totalMinted + amount;
      if (newTotal > this.state.maxSupply) throw new Error("110");
      this.assertNotZeroAddress(recipient);
      this.state.totalMinted = newTotal;
      this.state.totalSupply += amount;
      this.state.balances.set(recipient, (this.state.balances.get(recipient) || BigInt(0)) + amount);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  burn(amount: bigint, sender: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      if (!this.state.burnEnabled) throw new Error("104");
      if (this.caller !== sender) throw new Error("100");
      this.assertValidAmount(amount);
      this.assertNotZeroAddress(sender);
      const balance = this.state.balances.get(sender) || BigInt(0);
      if (balance < amount) throw new Error("101");
      this.state.balances.set(sender, balance - amount);
      this.state.totalSupply -= amount;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  pause(): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.paused = true;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  unpause(): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.paused = false;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  toggleMint(): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.mintEnabled = !this.state.mintEnabled;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  toggleBurn(): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.burnEnabled = !this.state.burnEnabled;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  addWhitelistedMinter(minter: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.assertNotZeroAddress(minter);
      this.state.whitelistedMinters.add(minter);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  removeWhitelistedMinter(minter: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.whitelistedMinters.delete(minter);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  blacklistAccount(account: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.assertNotZeroAddress(account);
      this.state.blacklisted.add(account);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  unblacklistAccount(account: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.state.blacklisted.delete(account);
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  transferOwnership(newOwner: string): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      this.assertNotZeroAddress(newOwner);
      this.state.owner = newOwner;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }

  updateMaxSupply(newMax: bigint): { ok: boolean; value: boolean } | { ok: boolean; value: number } {
    try {
      this.assertOwner();
      if (newMax < this.state.totalMinted) throw new Error("110");
      this.state.maxSupply = newMax;
      return { ok: true, value: true };
    } catch (e: any) {
      return { ok: false, value: parseInt(e.message) };
    }
  }
}

describe("EFC Token", () => {
  let token: EFCTokenMock;

  beforeEach(() => {
    token = new EFCTokenMock();
    token.reset();
  });

  it("has correct metadata", () => {
    expect(token.getName().value).toBe("EcoFoodChain Token");
    expect(token.getSymbol().value).toBe("EFC");
    expect(token.getDecimals().value).toBe(BigInt(6));
    expect(token.getMaxSupply().value).toBe(BigInt(1000000000));
  });

  it("mints tokens correctly", () => {
    const result = token.mint(BigInt(1000), "ST1FARMER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1FARMER").value).toBe(BigInt(1000));
    expect(token.getTotalSupply().value).toBe(BigInt(1000));
    expect(token.getTotalMinted().value).toBe(BigInt(1000));
  });

  it("allows whitelisted minter to mint", () => {
    token.addWhitelistedMinter("ST1MINTER");
    token.caller = "ST1MINTER";
    const result = token.mint(BigInt(500), "ST1FARMER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1FARMER").value).toBe(BigInt(500));
  });

  it("prevents mint when disabled", () => {
    token.toggleMint();
    const result = token.mint(BigInt(100), "ST1FARMER");
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(103);
  });

  it("enforces max supply", () => {
    token.updateMaxSupply(BigInt(1000));
    token.mint(BigInt(1000), "ST1FARMER");
    const result = token.mint(BigInt(1), "ST1FARMER");
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(110);
  });

  it("transfers tokens successfully", () => {
    token.mint(BigInt(1000), "ST1FARMER");
    token.caller = "ST1FARMER";
    const result = token.transfer(BigInt(300), "ST1FARMER", "ST2SUPPLIER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1FARMER").value).toBe(BigInt(700));
    expect(token.getBalance("ST2SUPPLIER").value).toBe(BigInt(300));
  });

  it("blocks transfer when paused", () => {
    token.mint(BigInt(1000), "ST1FARMER");
    token.pause();
    token.caller = "ST1FARMER";
    const result = token.transfer(BigInt(100), "ST1FARMER", "ST2SUPPLIER");
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(108);
  });

  it("blocks blacklisted accounts", () => {
    token.mint(BigInt(1000), "ST1FARMER");
    token.blacklistAccount("ST1FARMER");
    token.caller = "ST1FARMER";
    const result = token.transfer(BigInt(100), "ST1FARMER", "ST2SUPPLIER");
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(109);
  });

  it("burns tokens correctly", () => {
    token.mint(BigInt(1000), "ST1FARMER");
    token.caller = "ST1FARMER";
    const result = token.burn(BigInt(400), "ST1FARMER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST1FARMER").value).toBe(BigInt(600));
    expect(token.getTotalSupply().value).toBe(BigInt(600));
  });

  it("prevents burn when disabled", () => {
    token.mint(BigInt(1000), "ST1FARMER");
    token.toggleBurn();
    token.caller = "ST1FARMER";
    const result = token.burn(BigInt(100), "ST1FARMER");
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(104);
  });

  it("transfers ownership", () => {
    token.transferOwnership("ST2NEWOWNER");
    expect(token.state.owner).toBe("ST2NEWOWNER");
  });

  it("only owner can pause/unpause", () => {
    token.caller = "ST1HACKER";
    const pauseResult = token.pause();
    expect(pauseResult.ok).toBe(false);
    expect((pauseResult as any).value).toBe(100);
  });

  it("handles edge amounts correctly", () => {
    token.mint(BigInt(1), "ST1FARMER");
    token.caller = "ST1FARMER";
    const result = token.transfer(BigInt(1), "ST1FARMER", "ST2SUPPLIER");
    expect(result.ok).toBe(true);
    expect(token.getBalance("ST2SUPPLIER").value).toBe(BigInt(1));
  });
});