(define-fungible-token efc-token u1000000000)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INSUFFICIENT-BALANCE (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-MINT-DISABLED (err u103))
(define-constant ERR-BURN-DISABLED (err u104))
(define-constant ERR-TRANSFER-FAILED (err u105))
(define-constant ERR-RECIPIENT-ZERO (err u106))
(define-constant ERR-SENDER-ZERO (err u107))
(define-constant ERR-PAUSED (err u108))
(define-constant ERR-NOT-WHITELISTED (err u109))
(define-constant ERR-MAX-SUPPLY-EXCEEDED (err u110))

(define-data-var token-owner principal tx-sender)
(define-data-var mint-enabled bool true)
(define-data-var burn-enabled bool true)
(define-data-var paused bool false)
(define-data-var max-supply uint u1000000000)
(define-data-var total-minted uint u0)

(define-map whitelisted-minters principal bool)
(define-map transfer-blacklist principal bool)

(define-read-only (get-name)
  (ok "EcoFoodChain Token")
)

(define-read-only (get-symbol)
  (ok "EFC")
)

(define-read-only (get-decimals)
  (ok u6)
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply efc-token))
)

(define-read-only (get-max-supply)
  (ok (var-get max-supply))
)

(define-read-only (get-total-minted)
  (ok (var-get total-minted))
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance efc-token account))
)

(define-read-only (is-mint-enabled)
  (ok (var-get mint-enabled))
)

(define-read-only (is-burn-enabled)
  (ok (var-get burn-enabled))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)

(define-read-only (is-whitelisted-minter (minter principal))
  (default-to false (map-get? whitelisted-minters minter))
)

(define-read-only (is-blacklisted (account principal))
  (default-to false (map-get? transfer-blacklist account))
)

(define-read-only (get-token-uri)
  (ok (some u"https://ecofoodchain.org/metadata/efc-token.json"))
)

(define-private (check-not-paused)
  (asserts! (not (var-get paused)) ERR-PAUSED)
)

(define-private (check-valid-amount (amount uint))
  (asserts! (> amount u0) ERR-INVALID-AMOUNT)
)

(define-private (check-not-zero-address (addr principal))
  (asserts! (not (is-eq addr 'SP000000000000000000002Q6VF78)) ERR-SENDER-ZERO)
  (asserts! (not (is-eq addr 'ST000000000000000000002AMW42H)) ERR-SENDER-ZERO)
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (let (
    (sender-balance (ft-get-balance efc-token sender))
  )
    (check-not-paused)
    (check-valid-amount amount)
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)
    (asserts! (not (is-blacklisted sender)) ERR-NOT-WHITELISTED)
    (asserts! (not (is-blacklisted recipient)) ERR-NOT-WHITELISTED)
    (check-not-zero-address sender)
    (check-not-zero-address recipient)
    (match (ft-transfer? efc-token amount sender recipient)
      success (ok success)
      error ERR-TRANSFER-FAILED
    )
  )
)

(define-public (mint (amount uint) (recipient principal))
  (let (
    (current-minted (var-get total-minted))
    (new-total (+ current-minted amount))
  )
    (asserts! (var-get mint-enabled) ERR-MINT-DISABLED)
    (asserts! (or (is-eq tx-sender (var-get token-owner)) (is-whitelisted-minter tx-sender)) ERR-NOT-AUTHORIZED)
    (check-valid-amount amount)
    (asserts! (<= new-total (var-get max-supply)) ERR-MAX-SUPPLY-EXCEEDED)
    (check-not-zero-address recipient)
    (try! (ft-mint? efc-token amount recipient))
    (var-set total-minted new-total)
    (print { event: "mint", recipient: recipient, amount: amount })
    (ok true)
  )
)

(define-public (burn (amount uint) (sender principal))
  (begin
    (asserts! (var-get burn-enabled) ERR-BURN-DISABLED)
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (check-valid-amount amount)
    (check-not-zero-address sender)
    (try! (ft-burn? efc-token amount sender))
    (print { event: "burn", sender: sender, amount: amount })
    (ok true)
  )
)

(define-public (pause)
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (var-set paused true)
    (print { event: "paused", by: tx-sender })
    (ok true)
  )
)

(define-public (unpause)
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (var-set paused false)
    (print { event: "unpaused", by: tx-sender })
    (ok true)
  )
)

(define-public (toggle-mint)
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (var-set mint-enabled (not (var-get mint-enabled)))
    (print { event: "mint-toggled", enabled: (var-get mint-enabled) })
    (ok true)
  )
)

(define-public (toggle-burn)
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (var-set burn-enabled (not (var-get burn-enabled)))
    (print { event: "burn-toggled", enabled: (var-get burn-enabled) })
    (ok true)
  )
)

(define-public (add-whitelisted-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (check-not-zero-address minter)
    (map-set whitelisted-minters minter true)
    (print { event: "minter-whitelisted", minter: minter })
    (ok true)
  )
)

(define-public (remove-whitelisted-minter (minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (map-delete whitelisted-minters minter)
    (print { event: "minter-removed", minter: minter })
    (ok true)
  )
)

(define-public (blacklist-account (account principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (check-not-zero-address account)
    (map-set transfer-blacklist account true)
    (print { event: "account-blacklisted", account: account })
    (ok true)
  )
)

(define-public (unblacklist-account (account principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (map-delete transfer-blacklist account)
    (print { event: "account-unblacklisted", account: account })
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (check-not-zero-address new-owner)
    (var-set token-owner new-owner)
    (print { event: "ownership-transferred", new-owner: new-owner })
    (ok true)
  )
)

(define-public (update-max-supply (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get token-owner)) ERR-NOT-AUTHORIZED)
    (asserts! (>= new-max (var-get total-minted)) ERR-MAX-SUPPLY-EXCEEDED)
    (var-set max-supply new-max)
    (print { event: "max-supply-updated", new-max: new-max })
    (ok true)
  )
)