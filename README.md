# EcoFoodChain: Blockchain-Based Food Supply Chain Tracker

## Overview

EcoFoodChain is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It provides a transparent tracking system for food products, from farm to table, while rewarding farmers and suppliers for verified organic or sustainable practices. Participants earn redeemable tokens (EFC tokens) that can be used within the ecosystem for services like premium listings, certifications, or partnerships.

### Real-World Problems Solved
- **Lack of Transparency in Supply Chains**: Traditional food supply chains are opaque, leading to fraud, contamination recalls, and consumer distrust. EcoFoodChain uses blockchain to provide immutable traceability.
- **Verification of Sustainable Practices**: It's hard to prove organic or eco-friendly farming without trusted audits. The system integrates verifiable proofs (e.g., via oracles or certified verifiers) to ensure authenticity.
- **Incentivizing Sustainability**: Farmers often lack economic motivation for sustainable practices. Rewards in tokens encourage adoption, creating a positive feedback loop.
- **Fraud and Counterfeiting**: By tokenizing products and practices, the system reduces fake organic claims and ensures fair compensation.
- **Ecosystem Redemption**: Tokens aren't just speculative; they're redeemable for real value like discounts on eco-friendly supplies or access to markets.

The project involves 6 core smart contracts:
1. **EFC Token Contract**: Manages the reward token (fungible token).
2. **User Registry Contract**: Registers farmers, suppliers, and verifiers.
3. **Product Tracking Contract**: Tracks food products through the supply chain.
4. **Verification Contract**: Handles submission and approval of sustainable practice proofs.
5. **Reward Distribution Contract**: Distributes tokens based on verified actions.
6. **Redemption Contract**: Allows token redemption for ecosystem benefits.

## Architecture
- **Stacks Blockchain**: Chosen for its security (anchored to Bitcoin) and Clarity's safety features (no reentrancy, explicit errors).
- **Token Standard**: Uses SIP-010 for fungible tokens.
- **Integration**: Front-end (not included here) could use Stacks.js for wallet interactions. Oracles (e.g., via Chainlink on Stacks) for off-chain verifications.
- **Security**: Contracts are designed with access controls, error handling, and minimal state changes.

## Installation and Deployment
1. Install Clarity CLI: `cargo install clarity-cli`.
2. Clone the repo: `this repo`.
3. Deploy contracts using Clarinet: `clarinet deploy`.
4. Test: `clarinet test`.

## Smart Contracts

Below are the 6 smart contracts in Clarity. Each is self-contained but interacts via contract calls.

### 1. EFC Token Contract (efc-token.clar)
This contract implements a SIP-010 fungible token for rewards.

```clarity
(define-fungible-token efc-token u1000000000) ;; Max supply: 1 billion

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant OWNER tx-sender)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (ft-transfer? efc-token amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR-NOT-AUTHORIZED)
    (ft-mint? efc-token amount recipient)
  )
)

(define-public (burn (amount uint) (sender principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (ft-burn? efc-token amount sender)
  )
)

(define-read-only (get-balance (account principal))
  (ft-get-balance efc-token account)
)

(define-read-only (get-total-supply)
  (ft-get-supply efc-token)
)

(define-read-only (get-name)
  (ok "EFC Token")
)

(define-read-only (get-symbol)
  (ok "EFC")
)

(define-read-only (get-decimals)
  (ok u6)
)

(define-read-only (get-token-uri)
  (ok none)
)
```

### 2. User Registry Contract (user-registry.clar)
Registers users with roles (farmer, supplier, verifier).

```clarity
(define-map users principal { role: (string-ascii 20), verified: bool })
(define-constant ERR-ALREADY-REGISTERED (err u101))
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant OWNER tx-sender)

(define-public (register (role (string-ascii 20)))
  (begin
    (asserts! (is-none (map-get? users tx-sender)) ERR-ALREADY-REGISTERED)
    (map-set users tx-sender { role: role, verified: false })
    (ok true)
  )
)

(define-public (verify-user (user principal))
  (begin
    (asserts! (is-eq tx-sender OWNER) ERR-NOT-AUTHORIZED) ;; In production, use verifier role
    (match (map-get? users user)
      some-user (map-set users user (merge some-user { verified: true }))
      none (err u102)
    )
    (ok true)
  )
)

(define-read-only (get-user (user principal))
  (map-get? users user)
)

(define-read-only (is-verified (user principal))
  (default-to false (get verified (map-get? users user)))
)
```

### 3. Product Tracking Contract (product-tracking.clar)
Tracks products with unique IDs and supply chain steps.

```clarity
(define-map products uint { owner: principal, description: (string-utf8 256), stages: (list 10 (string-ascii 50)) })
(define-data-var next-id uint u1)
(define-constant ERR-NOT-OWNER (err u103))
(define-constant ERR-NOT-VERIFIED (err u104))

(define-public (register-product (description (string-utf8 256)))
  (let ((id (var-get next-id)))
    (asserts! (contract-call? .user-registry is-verified tx-sender) ERR-NOT-VERIFIED)
    (map-set products id { owner: tx-sender, description: description, stages: (list "Registered") })
    (var-set next-id (+ id u1))
    (ok id)
  )
)

(define-public (add-stage (product-id uint) (stage (string-ascii 50)))
  (match (map-get? products product-id)
    some-product
      (begin
        (asserts! (is-eq (get owner some-product) tx-sender) ERR-NOT-OWNER)
        (map-set products product-id (merge some-product { stages: (append (get stages some-product) stage) }))
        (ok true)
      )
    none (err u105)
  )
)

(define-read-only (get-product (product-id uint))
  (map-get? products product-id)
)
```

### 4. Verification Contract (verification.clar)
Submits and approves proofs of sustainable practices.

```clarity
(define-map verifications uint { submitter: principal, proof: (string-utf8 512), approved: bool })
(define-data-var next-verif-id uint u1)
(define-constant ERR-NOT-VERIFIER (err u106))
(define-constant ERR-ALREADY-APPROVED (err u107))

(define-public (submit-proof (proof (string-utf8 512)))
  (let ((id (var-get next-verif-id)))
    (asserts! (contract-call? .user-registry is-verified tx-sender) ERR-NOT-VERIFIED)
    (map-set verifications id { submitter: tx-sender, proof: proof, approved: false })
    (var-set next-verif-id (+ id u1))
    (ok id)
  )
)

(define-public (approve-proof (verif-id uint))
  (match (map-get? verifications verif-id)
    some-verif
      (begin
        (asserts! (is-eq (get role (contract-call? .user-registry get-user tx-sender)) "verifier") ERR-NOT-VERIFIER)
        (asserts! (not (get approved some-verif)) ERR-ALREADY-APPROVED)
        (map-set verifications verif-id (merge some-verif { approved: true }))
        (ok true)
      )
    none (err u108)
  )
)

(define-read-only (get-verification (verif-id uint))
  (map-get? verifications verif-id)
)
```

### 5. Reward Distribution Contract (reward-distribution.clar)
Distributes tokens upon approved verifications.

```clarity
(define-constant REWARD-AMOUNT u1000) ;; 1000 tokens per verification
(define-constant ERR-NOT-APPROVED (err u109))

(define-public (claim-reward (verif-id uint))
  (match (contract-call? .verification get-verification verif-id)
    some-verif
      (begin
        (asserts! (get approved some-verif) ERR-NOT-APPROVED)
        (asserts! (is-eq (get submitter some-verif) tx-sender) ERR-NOT-OWNER)
        (try! (contract-call? .efc-token mint REWARD-AMOUNT tx-sender))
        (ok REWARD-AMOUNT)
      )
    none (err u110)
  )
)
```

### 6. Redemption Contract (redemption.clar)
Allows redeeming tokens for ecosystem benefits (e.g., virtual services).

```clarity
(define-map redemptions (string-ascii 50) uint) ;; Service -> Cost
(define-constant ERR-INSUFFICIENT-BALANCE (err u111))

(define-public (add-service (service (string-ascii 50)) (cost uint))
  (begin
    (asserts! (is-eq tx-sender (contract-call? .efc-token OWNER)) ERR-NOT-AUTHORIZED)
    (map-set redemptions service cost)
    (ok true)
  )
)

(define-public (redeem (service (string-ascii 50)))
  (match (map-get? redemptions service)
    some-cost
      (begin
        (asserts! (>= (contract-call? .efc-token get-balance tx-sender) some-cost) ERR-INSUFFICIENT-BALANCE)
        (try! (contract-call? .efc-token burn some-cost tx-sender))
        (ok service)
      )
    none (err u112)
  )
)
```

## Usage Examples
- Farmer registers and submits proof.
- Verifier approves.
- Farmer claims reward.
- Tracks product stages.
- Redeems tokens for services.

## Testing
Use Clarinet to test interactions, e.g., registering users, minting tokens, etc.

## Future Improvements
- Integrate oracles for automated verifications.
- Add NFT for unique products.
- Governance for tokenomics updates.

## License
MIT License.