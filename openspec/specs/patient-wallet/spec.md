# patient-wallet Specification

## Purpose

Silo-scoped client account balance: gift-credit top-ups (paid + promotional amounts as separate auditable fields), GST-compliant top-up invoicing that charges only the paid amount, drawdown at checkout, and a differentiated ledger history.

## Requirements

### Requirement: Silo-scoped account balance
Each client SHALL have an account balance derived from an append-only wallet ledger keyed to that client. Because a client belongs to exactly one owner silo, wallet visibility and operations SHALL follow the client's commercial access rules — only the owning silo (and, for clinic-owned clients, clinic-context users) can view or operate the wallet. The balance SHALL always equal the sum of ledger entries and SHALL never be stored separately.

#### Scenario: Wallet follows the silo
- **WHEN** an independent nurse tops up their own client and later views the client under a clinic identity
- **THEN** the credit exists only under the nurse-owned client's wallet and is not visible from any other silo

#### Scenario: Balance is derived
- **WHEN** ledger entries total $5,000 in credits and $1,200 in drawdowns
- **THEN** the displayed balance is exactly $3,800

### Requirement: Top-up with paid amount and gift credit
The top-up form SHALL present two inputs: Paid Amount (实际支付) — the money actually collected — and Gift Credit (赠送金额) — a promotional bonus, defaulting to zero. The form SHALL live-display Total Credit Added (到账总额) = Paid Amount + Gift Credit. On confirmation the ledger SHALL record `paidCents`, `giftCents`, and `totalCreditCents` as separate integer-cent fields in one top-up entry, and the balance SHALL increase by the total credit. A top-up with zero paid amount and zero gift SHALL be rejected; negative values SHALL be rejected.

#### Scenario: Promotional top-up
- **WHEN** the operator enters $4,000 paid and $1,000 gift and confirms
- **THEN** the form shows $5,000 total credit before confirming, the ledger entry stores 400000/100000/500000 cents, and the balance rises by $5,000

#### Scenario: Plain cash top-up
- **WHEN** the operator enters $500 paid and leaves gift at zero
- **THEN** the entry records $500 paid, $0 gift, $500 total

### Requirement: GST-compliant top-up tax invoice
Each top-up SHALL generate a tax invoice (kind `top-up`) whose only taxable line is the Paid Amount: the paid value is GST-inclusive, per-line GST = round(paid / 11), and totals reflect the paid amount alone. The gift credit SHALL appear as a non-taxable footnote row inside the items grid reading "Promotional Gift Credit Applied: <gift> (Non-Taxable). Total Wallet Value Loaded: <total>." with the numeric columns dashed so grid totals visibly exclude it. When the gift is zero the footnote SHALL be omitted. Issuer resolution SHALL follow the checkout rules for the client's silo (own entity for independents, clinic entity for clinic-owned clients).

#### Scenario: Invoice charges only the paid amount
- **WHEN** a $4,000 paid / $1,000 gift top-up is confirmed
- **THEN** the tax invoice totals $4,000 with GST $363.64, and no taxable line for the gift exists

#### Scenario: Gift footnote renders
- **WHEN** the top-up invoice for that transaction renders (preview or PDF)
- **THEN** the grid contains the non-taxable footnote naming $1,000 gift and $5,000 total wallet value loaded

### Requirement: Differentiated ledger history
The client's account history SHALL list every wallet event with type, amounts, actor, timestamp, and linked invoice: cash top-ups showing the paid amount, gift credit visibly flagged as a promotional/manual grant distinct from cash, and drawdowns showing the amount and the invoice they settled. The history SHALL make cash and gift contributions independently auditable within a single top-up entry.

#### Scenario: Mixed history reads cleanly
- **WHEN** a client has a $4,000+$1,000 top-up followed by a $1,200 wallet-paid checkout
- **THEN** the history shows a top-up entry distinguishing $4,000 cash from $1,000 gift, and a $1,200 drawdown linked to the checkout invoice

#### Scenario: Gift is flagged
- **WHEN** any top-up includes gift credit
- **THEN** the history row visually and textually marks the gift portion as promotional (non-cash)
