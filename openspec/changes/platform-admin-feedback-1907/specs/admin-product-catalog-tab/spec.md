## ADDED Requirements

### Requirement: Product catalog lives in its own Products tab
The platform-admin navigation SHALL include a top-level **Products** tab (`/app/admin/products`) alongside Admin, Patient lookup, Audit, and Profile. The Products page SHALL render the product catalog editor (grouped product list with activate/deactivate, plus the add-product form) with unchanged behaviour, gated to super admins exactly like the Admin page. The Admin page SHALL NOT render the product catalog section any more. Clinical roles SHALL NOT see the Products tab.

#### Scenario: Products tab shows the catalog editor
- **WHEN** a super admin opens the Products tab
- **THEN** the product catalog editor (grouped list, activate/deactivate, add product) renders and works as it did on the Admin page

#### Scenario: Admin page no longer hosts the catalog
- **WHEN** a super admin opens the Admin tab
- **THEN** accounts, cooperation relationships, and business entities render, but the product catalog section does not

#### Scenario: Tab highlighting
- **WHEN** a super admin is on `/app/admin/products`
- **THEN** the Products tab renders active and the Admin tab does not (longest-prefix nav matching)

#### Scenario: Clinical roles unaffected
- **WHEN** a doctor, nurse, or clinic admin signs in
- **THEN** their navigation is unchanged and `/app/admin/products` renders nothing for them
