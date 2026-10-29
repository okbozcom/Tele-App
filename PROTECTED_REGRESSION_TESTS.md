# Hi Talk — Protected Features Regression Suite (P1 – P6)

This document specifies the exact regression safeguards and test suite locking all 6 protected items (**P1–P6**) in accordance with Section 1 of the NeoDove Parity Master Prompt.

> **RULE:** These 6 protected items must remain 100% identical in behavior, user contract, layout, and permissions. If any future modification breaks these tests, the modification must be fixed—not the test.

---

## 1. Protected Items Inventory

### P1: Sign-in Page & Authentication Contract
- **Scope**: `mobile/src/screens/LoginScreen.tsx`, `server/src/routes/auth.routes.ts`, `server/src/controllers/auth.controller.ts`, `server/src/services/auth.service.ts`.
- **Contract**:
  - Fields: Email + Password only (no OTP, no biometrics, no new input fields).
  - Validation: Email trimmed and lowercased; password checked against bcrypt hash.
  - Inactive users are rejected with `401 Unauthorized` ("User account has been deactivated").
  - Response contract: `{ token: string, user: IUserDoc }`.
  - Token payload: `{ id, role, tokenVersion }`.
- **Automated Tests**:
  - `rejects login when user does not exist (401)`
  - `rejects login when user is deactivated (401)`
  - `rejects login when password does not match (401)`
  - `returns valid token and user object upon successful credentials`

---

### P2: Branch-wise Team Management & Branch Safeguards
- **Scope**: `mobile/src/screens/TeamScreen.tsx`, `server/src/routes/user.routes.ts`, `server/src/services/user.service.ts`.
- **Contract**:
  - Manager hierarchy lock: A `MANAGER` can only create, list, and delete `AGENT` users within their assigned branch.
  - Managers cannot create `ADMIN` or `MANAGER` accounts (`403 Forbidden`).
  - Branch injection guard: Any branch passed in payload by a manager is overwritten with the manager's assigned branch.
  - Admin safeguards: Cannot delete the last active administrator account (`400 Bad Request`).
  - Safe lead reassignment: When an agent is deleted or deactivated, all open leads (`status: 'OPEN'`) are automatically reassigned to an active agent in the same branch, or fallback to the manager/admin.
- **Automated Tests**:
  - `prevents a MANAGER from creating non-AGENT users (403)`
  - `locks newly created agent to manager branch when created by MANAGER`
  - `prevents deleting the only active administrator (400)`
  - `safely reassigns open leads to active branch agent when agent is deleted`

---

### P3: Settings Page Integrity
- **Scope**: `mobile/src/screens/SettingsScreen.tsx`, `server/src/models/setting.model.ts`, `server/src/services/setting.service.ts`.
- **Contract**:
  - Core settings: `allowDisposeWithoutFollowUp`, `followUpMandatoryForNotConnected`, `autoLeadDistribution`, `reassignAfterHours`.
  - Nothing existing may be deleted, renamed, or moved.
  - New NeoDove settings must be additive only in clearly labeled new sections.
- **Automated Tests**:
  - `preserves core settings fields and defaults`
  - `updates system settings correctly while preserving all fields`

---

### P4: Agents Editing Own Leads Name & Phone Number
- **Scope**: `mobile/src/screens/LeadDetailScreen.tsx`, `mobile/src/screens/HomeScreen.tsx`, `server/src/controllers/lead.controller.ts`, `server/src/services/lead.service.ts`.
- **Contract**:
  - Agents can edit their assigned leads' `name` and `phone` directly.
  - Role-based authorization: An `AGENT` can only update leads assigned to them (`assignedTo === requester._id`). Attempting to edit other leads returns `403 Forbidden`.
  - Audit logging: Updates are written to audit log with action `LEAD_UPDATE`.
- **Automated Tests**:
  - `allows an AGENT to update name and phone of their own assigned lead`
  - `strictly forbids an AGENT from editing a lead assigned to another user (403)`

---

### P5: Agents Tagging / Assigning Leads to Admin & Manager
- **Scope**: `server/src/models/tagged-lead.model.ts`, `server/src/services/lead.service.ts`, `LeadDetailScreen.tsx`.
- **Contract**:
  - Agents can tag/escalate leads to `MANAGER`, `ADMIN`, or `BOTH` with reason and optional note.
  - Validates lead ID format (`400 Bad Request`).
  - Emits timeline update activity (`type: 'UPDATE'`).
  - Dismissing tagged lead requires authorization.
- **Automated Tests**:
  - `allows an AGENT to tag an assigned lead to MANAGER with reason and note`
  - `rejects tagging when leadId format is invalid (400)`

---

### P6: Admin Creates Campaigns Branch-wise
- **Scope**: `server/src/models/campaign.model.ts`, `server/src/services/campaign.service.ts`, `CampaignsScreen.tsx`.
- **Contract**:
  - Admin creates campaigns bound to specific branches or global (`branch: null`).
  - Manager campaign creation is strictly locked to manager's branch.
  - Pipeline validation: `pipelineId` must reference a valid existing pipeline (`400 Bad Request` if invalid).
  - Agent validation: Assigned agents must exist, have role `AGENT`, and be active.
- **Automated Tests**:
  - `creates campaign with branch binding and validated agents`
  - `prevents a MANAGER from creating campaigns outside their own branch (locks to manager branch)`
  - `rejects campaign creation if assigned pipeline does not exist (400)`

---

## 2. Test Execution Command

To run the protected feature regression suite:

```bash
npm test --prefix server
# Or specifically:
node --test server/tests/protected-regression.test.cjs
```

All 17 tests in `server/tests/protected-regression.test.cjs` and all 45 existing tests must pass at every commit.
