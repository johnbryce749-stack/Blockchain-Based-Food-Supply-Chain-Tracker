(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROOF u101)
(define-constant ERR-PROOF-NOT-FOUND u102)
(define-constant ERR-ALREADY-APPROVED u103)
(define-constant ERR-ALREADY-REJECTED u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-INVALID-VERIFIER u106)
(define-constant ERR-PROOF-EXPIRED u107)
(define-constant ERR-INVALID-EVIDENCE u108)
(define-constant ERR-VERIFIER-NOT-REGISTERED u109)
(define-constant ERR-SUBMITTER-BLOCKED u110)
(define-constant ERR-MAX-PROOFS-REACHED u111)
(define-constant ERR-INVALID-TIMESTAMP u112)
(define-constant ERR-INVALID-CATEGORY u113)
(define-constant ERR-INVALID-LOCATION u114)
(define-constant ERR-INVALID-SCORE u115)
(define-constant ERR-INSUFFICIENT-STAKE u116)
(define-constant ERR-STAKE-LOCKED u117)
(define-constant ERR-INVALID-UPDATE u118)
(define-constant ERR-PROOF-CLOSED u119)

(define-data-var next-proof-id uint u1)
(define-data-var proof-expiry-blocks uint u52560)
(define-data-var min-verifier-stake uint u1000000)
(define-data-var verification-quorum uint u3)
(define-data-var max-proofs-per-user uint u50)
(define-data-var authority-principal principal tx-sender)

(define-map proofs
  uint
  {
    submitter: principal,
    category: (string-ascii 50),
    location: (string-utf8 100),
    evidence-hash: (buff 32),
    timestamp: uint,
    status: (string-ascii 20),
    score: uint,
    expiry: uint,
    closed: bool
  }
)

(define-map proof-updates
  uint
  {
    updater: principal,
    old-status: (string-ascii 20),
    new-status: (string-ascii 20),
    timestamp: uint,
    reason: (string-utf8 256)
  }
)

(define-map verifications
  { proof-id: uint, verifier: principal }
  {
    approved: bool,
    timestamp: uint,
    confidence: uint
  }
)

(define-map verifier-registry
  principal
  {
    registered: bool,
    stake: uint,
    reputation: uint,
    active-proofs: uint,
    last-activity: uint
  }
)

(define-map user-submissions
  principal
  uint
)

(define-map blocked-users
  principal
  bool
)

(define-read-only (get-proof (proof-id uint))
  (map-get? proofs proof-id)
)

(define-read-only (get-proof-update (proof-id uint))
  (map-get? proof-updates proof-id)
)

(define-read-only (get-verification (proof-id uint) (verifier principal))
  (map-get? verifications { proof-id: proof-id, verifier: verifier })
)

(define-read-only (get-verifier (user principal))
  (map-get? verifier-registry user)
)

(define-read-only (get-user-submission-count (user principal))
  (default-to u0 (map-get? user-submissions user))
)

(define-read-only (is-user-blocked (user principal))
  (default-to false (map-get? blocked-users user))
)

(define-read-only (is-proof-expired (proof-id uint))
  (match (map-get? proofs proof-id)
    proof (> block-height (get expiry proof))
    false
  )
)

(define-read-only (has-quorum (proof-id uint))
  (let (
    (verifs (fold filter-verifications
              (map-get? verifications { proof-id: proof-id, verifier: (as-contract tx-sender) })
              (list)))
    (approvals (filter is-approved-verification verifs))
  )
    (>= (len approvals) (var-get verification-quorum))
  )
)

(define-private (filter-verifications (key { proof-id: uint, verifier: principal }) (acc (list 10 { proof-id: uint, verifier: principal })))
  (if (is-eq (get proof-id key) (get proof-id (unwrap-panic (element-at acc u0))))
      (append acc key)
      acc
  )
)

(define-private (is-approved-verification (verif { proof-id: uint, verifier: principal }))
  (match (map-get? verifications verif)
    v (get approved v)
    false
  )
)

(define-private (validate-category (cat (string-ascii 50)))
  (or
    (is-eq cat "organic")
    (is-eq cat "carbon-neutral")
    (is-eq cat "water-efficient")
    (is-eq cat "biodiversity")
    (is-eq cat "fair-trade")
  )
)

(define-private (validate-evidence-hash (hash (buff 32)))
  (not (is-eq hash 0x0000000000000000000000000000000000000000000000000000000000000000))
)

(define-private (validate-location (loc (string-utf8 100)))
  (and (> (len loc) u0) (<= (len loc) u100))
)

(define-private (validate-score (score uint))
  (and (>= score u0) (<= score u100))
)

(define-private (validate-verifier-stake (verifier principal))
  (match (map-get? verifier-registry verifier)
    v (>= (get stake v) (var-get min-verifier-stake))
    false
  )
)

(define-public (register-verifier)
  (let ((user tx-sender))
    (asserts! (is-eq (default-to false (get registered (map-get? verifier-registry user))) false) (err ERR-ALREADY-REGISTERED))
    (map-set verifier-registry user
      { registered: true, stake: u0, reputation: u50, active-proofs: u0, last-activity: block-height }
    )
    (ok true)
  )
)

(define-public (stake-for-verification (amount uint))
  (let ((user tx-sender))
    (asserts! (> amount u0) (err ERR-INVALID-STAKE))
    (match (map-get? verifier-registry user)
      v
        (let ((new-stake (+ (get stake v) amount)))
          (try! (stx-transfer? amount user (as-contract tx-sender)))
          (map-set verifier-registry user (merge v { stake: new-stake, last-activity: block-height }))
          (ok new-stake)
        )
      (err ERR-VERIFIER-NOT-REGISTERED)
    )
  )
)

(define-public (unstake-verifier (amount uint))
  (let ((user tx-sender))
    (match (map-get? verifier-registry user)
      v
        (begin
          (asserts! (>= (get stake v) amount) (err ERR-INSUFFICIENT-STAKE))
          (asserts! (is-eq (get active-proofs v) u0) (err ERR-STAKE-LOCKED))
          (map-set verifier-registry user (merge v { stake: (- (get stake v) amount) }))
          (try! (as-contract (stx-transfer? amount (as-contract tx-sender) user)))
          (ok (- (get stake v) amount))
        )
      (err ERR-VERIFIER-NOT-REGISTERED)
    )
  )
)

(define-public (submit-proof
  (category (string-ascii 50))
  (location (string-utf8 100))
  (evidence-hash (buff 32))
)
  (let (
    (proof-id (var-get next-proof-id))
    (submitter tx-sender)
    (submission-count (get-user-submission-count submitter))
    (expiry (+ block-height (var-get proof-expiry-blocks)))
  )
    (asserts! (not (is-user-blocked submitter)) (err ERR-SUBMITTER-BLOCKED))
    (asserts! (< submission-count (var-get max-proofs-per-user)) (err ERR-MAX-PROOFS-REACHED))
    (asserts! (validate-category category) (err ERR-INVALID-CATEGORY))
    (asserts! (validate-location location) (err ERR-INVALID-LOCATION))
    (asserts! (validate-evidence-hash evidence-hash) (err ERR-INVALID-EVIDENCE))
    (map-set proofs proof-id
      {
        submitter: submitter,
        category: category,
        location: location,
        evidence-hash: evidence-hash,
        timestamp: block-height,
        status: "pending",
        score: u0,
        expiry: expiry,
        closed: false
      }
    )
    (map-set user-submissions submitter (+ submission-count u1))
    (var-set next-proof-id (+ proof-id u1))
    (print { event: "proof-submitted", id: proof-id, submitter: submitter })
    (ok proof-id)
  )
)

(define-public (verify-proof
  (proof-id uint)
  (approved bool)
  (confidence uint)
)
  (let (
    (verifier tx-sender)
    (proof (unwrap! (map-get? proofs proof-id) (err ERR-PROOF-NOT-FOUND)))
  )
    (asserts! (validate-verifier-stake verifier) (err ERR-INSUFFICIENT-STAKE))
    (asserts! (not (get closed proof)) (err ERR-PROOF-CLOSED))
    (asserts! (not (is-proof-expired proof-id)) (err ERR-PROOF-EXPIRED))
    (asserts! (validate-score confidence) (err ERR-INVALID-SCORE))
    (asserts! (is-none (map-get? verifications { proof-id: proof-id, verifier: verifier })) (err ERR-ALREADY-REVIEWED))
    (map-set verifications
      { proof-id: proof-id, verifier: verifier }
      { approved: approved, timestamp: block-height, confidence: confidence }
    )
    (match (map-get? verifier-registry verifier)
      v (map-set verifier-registry verifier
          (merge v { active-proofs: (+ (get active-proofs v) u1), last-activity: block-height }))
      (ok false)
    )
    (if (and approved (has-quorum proof-id))
      (try! (finalize-proof-approval proof-id))
      (ok true)
    )
  )
)

(define-private (finalize-proof-approval (proof-id uint))
  (let ((proof (unwrap! (map-get? proofs proof-id) (err ERR-PROOF-NOT-FOUND))))
    (map-set proofs proof-id
      (merge proof
        {
          status: "approved",
          score: (calculate-proof-score proof-id),
          closed: true
        }
      )
    )
    (try! (update-submitter-reputation (get submitter proof) u10))
    (try! (distribute-verifier-rewards proof-id))
    (ok true)
  )
)

(define-private (calculate-proof-score (proof-id uint))
  (let (
    (verifs (fold collect-verifications
              (map-get? verifications { proof-id: proof-id, verifier: (as-contract tx-sender) })
              (list)))
    (total-confidence (fold sum-confidence verifs u0))
    (verifier-count (len verifs))
  )
    (if (> verifier-count u0)
      (/ (* total-confidence u100) (* verifier-count u100))
      u0
    )
  )
)

(define-private (collect-verifications (key { proof-id: uint, verifier: principal }) (acc (list 20 { proof-id: uint, verifier: principal })))
  (if (is-eq (get proof-id key) (get proof-id (unwrap-panic (element-at acc u0))))
      (append acc key)
      acc
  )
)

(define-private (sum-confidence (verif { proof-id: uint, verifier: principal }) (total uint))
  (match (map-get? verifications verif)
    v (if (get approved v) (+ total (get confidence v)) total)
    total
  )
)

(define-private (update-submitter-reputation (user principal) (delta uint))
  (match (map-get? verifier-registry user)
    v (map-set verifier-registry user
        (merge v { reputation: (min u100 (+ (get reputation v) delta)) }))
    (ok false)
  )
)

(define-private (distribute-verifier-rewards (proof-id uint))
  (let (
    (verifs (fold get-approved-verifiers
              (map-get? verifications { proof-id: proof-id, verifier: (as-contract tx-sender) })
              (list)))
  )
    (fold reward-verifier verifs (ok u0))
  )
)

(define-private (get-approved-verifiers (key { proof-id: uint, verifier: principal }) (acc (list 10 principal)))
  (match (map-get? verifications key)
    v (if (get approved v) (append acc (get verifier key)) acc)
    acc
  )
)

(define-private (reward-verifier (verifier principal) (prev (response uint uint)))
  (match (map-get? verifier-registry verifier)
    v
      (begin
        (map-set verifier-registry verifier
          (merge v { active-proofs: (- (get active-proofs v) u1) }))
        (ok (+ (unwrap-panic prev) u100))
      )
    (err u0)
  )
)

(define-public (reject-proof (proof-id uint) (reason (string-utf8 256)))
  (let (
    (verifier tx-sender)
    (proof (unwrap! (map-get? proofs proof-id) (err ERR-PROOF-NOT-FOUND)))
  )
    (asserts! (is-eq (get status proof) "pending") (err ERR-INVALID-STATUS))
    (asserts! (validate-verifier-stake verifier) (err ERR-INSUFFICIENT-STAKE))
    (map-set proofs proof-id
      (merge proof
        {
          status: "rejected",
          closed: true
        }
      )
    )
    (map-set proof-updates proof-id
      {
        updater: verifier,
        old-status: "pending",
        new-status: "rejected",
        timestamp: block-height,
        reason: reason
      }
    )
    (try! (update-submitter-reputation (get submitter proof) u5))
    (ok true)
  )
)

(define-public (close-proof (proof-id uint))
  (let ((proof (unwrap! (map-get? proofs proof-id) (err ERR-PROOF-NOT-FOUND))))
    (asserts! (or (is-eq tx-sender (get submitter proof)) (is-eq tx-sender (var-get authority-principal))) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get closed proof)) (err ERR-PROOF-CLOSED))
    (map-set proofs proof-id (merge proof { closed: true, status: "withdrawn" }))
    (ok true)
  )
)

(define-public (admin-block-user (user principal))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (map-set blocked-users user true)
    (ok true)
  )
)

(define-public (admin-set-quorum (new-quorum uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (and (> new-quorum u0) (<= new-quorum u10)) (err ERR-INVALID-UPDATE))
    (var-set verification-quorum new-quorum)
    (ok true)
  )
)

(define-public (admin-set-expiry (blocks uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority-principal)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> blocks u1000) (err ERR-INVALID-UPDATE))
    (var-set proof-expiry-blocks blocks)
    (ok true)
  )
)