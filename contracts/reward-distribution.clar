(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-VERIFICATION-NOT-FOUND u101)
(define-constant ERR-ALREADY-CLAIMED u102)
(define-constant ERR-INVALID-REWARD-AMOUNT u103)
(define-constant ERR-NOT-APPROVED u104)
(define-constant ERR-TOKEN-MINT-FAILED u105)
(define-constant ERR-INSUFFICIENT-TREASURY u106)
(define-constant ERR-REWARD-CAP-REACHED u107)
(define-constant ERR-INVALID-CATEGORY u108)
(define-constant ERR-COOLDOWN-ACTIVE u109)

(define-data-var treasury-balance uint u0)
(define-data-var reward-cap-per-cycle uint u5000000)
(define-data-var cycle-duration uint u2016)
(define-data-var current-cycle uint u0)
(define-data-var last-cycle-update uint u0)
(define-data-var base-reward-amount uint u1000)
(define-data-var cooldown-period uint u144)

(define-map claimed-rewards
  { verif-id: uint, claimant: principal }
  bool)

(define-map category-multipliers
  (string-ascii 20)
  uint)

(define-map verification-status
  uint
  { submitter: principal, approved: bool, category: (string-ascii 20), timestamp: uint })

(define-read-only (get-treasury-balance)
  (var-get treasury-balance))

(define-read-only (get-current-cycle)
  (var-get current-cycle))

(define-read-only (get-reward-cap)
  (var-get reward-cap-per-cycle))

(define-read-only (get-claimed-status (verif-id uint) (claimant principal))
  (map-get? claimed-rewards { verif-id: verif-id, claimant: claimant }))

(define-read-only (get-verification (verif-id uint))
  (map-get? verification-status verif-id))

(define-read-only (get-multiplier (category (string-ascii 20)))
  (default-to u100 (map-get? category-multipliers category)))

(define-private (advance-cycle)
  (let ((current-height block-height)
        (last-update (var-get last-cycle-update))
        (duration (var-get cycle-duration)))
    (if (>= current-height (+ last-update duration))
        (begin
          (var-set current-cycle (+ (var-get current-cycle) u1))
          (var-set last-cycle-update (+ last-update duration))
          true)
        false)))

(define-private (validate-category (category (string-ascii 20)))
  (match (map-get? category-multipliers category)
    multiplier (ok true)
    (err ERR-INVALID-CATEGORY)))

(define-private (calculate-reward (base uint) (multiplier uint))
  (* base multiplier))

(define-public (set-base-reward (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-REWARD-AMOUNT))
    (var-set base-reward-amount amount)
    (ok true)))

(define-public (set-category-multiplier (category (string-ascii 20)) (multiplier uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (>= multiplier u50) (<= multiplier u300)) (err ERR-INVALID-REWARD-AMOUNT))
    (map-set category-multipliers category multiplier)
    (ok true)))

(define-public (register-verification
  (verif-id uint)
  (submitter principal)
  (category (string-ascii 20))
  (approved bool))
  (begin
    (asserts! (is-eq tx-sender (contract-call? .verification get-contract-principal)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-category category))
    (map-set verification-status verif-id
      { submitter: submitter, approved: approved, category: category, timestamp: block-height })
    (ok true)))

(define-public (claim-reward (verif-id uint))
  (let ((verif (unwrap! (map-get? verification-status verif-id) (err ERR-VERIFICATION-NOT-FOUND)))
        (claimant (get submitter verif))
        (claimed-key { verif-id: verif-id, claimant: claimant }))
    (asserts! (is-eq tx-sender claimant) (err ERR-NOT-AUTHORIZED))
    (asserts! (get approved verif) (err ERR-NOT-APPROVED))
    (asserts! (is-none (map-get? claimed-rewards claimed-key)) (err ERR-ALREADY-CLAIMED))
    (asserts! (>= (- block-height (get timestamp verif)) (var-get cooldown-period)) (err ERR-COOLDOWN-ACTIVE))
    (advance-cycle)
    (let ((multiplier (get-multiplier (get category verif)))
          (reward (calculate-reward (var-get base-reward-amount) multiplier))
          (cap (var-get reward-cap-per-cycle)))
      (asserts! (<= reward cap) (err ERR-REWARD-CAP-REACHED))
      (asserts! (>= (var-get treasury-balance) reward) (err ERR-INSUFFICIENT-TREASURY))
      (var-set treasury-balance (- (var-get treasury-balance) reward))
      (map-set claimed-rewards claimed-key true)
      (try! (as-contract (contract-call? .efc-token mint reward claimant)))
      (ok reward))))

(define-public (deposit-treasury (amount uint))
  (begin
    (asserts! (> amount u0) (err ERR-INVALID-REWARD-AMOUNT))
    (try! (contract-call? .efc-token transfer amount tx-sender (as-contract tx-sender) none))
    (var-set treasury-balance (+ (var-get treasury-balance) amount))
    (ok true)))

(define-public (withdraw-treasury (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= amount (var-get treasury-balance)) (err ERR-INSUFFICIENT-TREASURY))
    (var-set treasury-balance (- (var-get treasury-balance) amount))
    (as-contract (contract-call? .efc-token transfer amount tx-sender recipient none))))

(define-constant contract-owner tx-sender)