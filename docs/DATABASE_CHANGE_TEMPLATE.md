# Database Change Template

Copy this file per schema change (new table, altered table, new index, new migration). Covers lifecycle phase 8 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **Database Gate**. Must comply with [DATABASE.md](DATABASE.md) and [MULTITENANCY.md](MULTITENANCY.md).

---

## Database change: [e.g., "Add PronunciationComparisonAttempt table"]

**Feature spec:** [link]
**Author:** [name]
**Database Gate reviewer:** [name]

## 1. Change type

☐ New table · ☐ Altered table · ☐ New index · ☐ Data migration · ☐ Partitioning change

## 2. Entities affected

*New/changed fields, types, relationships. If this adds an entity not yet listed in DATABASE.md §2, this template's approval includes updating that document in the same PR.*

| Entity | Field | Type | Nullable | Notes |
|---|---|---|---|---|

## 3. Tenant scoping & RLS

*Mandatory section — MULTITENANCY.md §6 requires this for every tenant-scoped table.*

**Is this table tenant-scoped (has an `organizationId` or equivalent)?** ☐ Yes ☐ No

If yes:
- RLS policy included in this migration: ☐ Yes (link to migration file)
- Application-layer filter present in the corresponding service: ☐ Yes
- Cross-tenant-leak integration test added: ☐ Yes (link to test)

**A "Yes" tenant-scoped table without all three checked is an automatic Database Gate failure (MULTITENANCY.md §6).**

## 4. Soft-delete / retention classification

*Per DATABASE.md §6–§7 — every new entity is classified, not left implicit.*

| Category | Selection |
|---|---|
| Deletion mechanism | ☐ Soft delete (`deletedAt`) ☐ Hard delete/anonymize (PII) ☐ Append-only, anonymized in place |
| Retention window | [cite DATABASE.md §7 matrix, or add a new row if this is a new data category] |
| Encryption needed | ☐ Standard at-rest ☐ Field-level (name fields) |

## 5. Indexing

*What query pattern does this serve? Composite index needed per DATABASE.md §4 hot-path conventions?*

## 6. Migration plan

- **Reversible:** ☐ Yes ☐ No (if no, justify — irreversible migrations require Database Gate owner sign-off explicitly, not just author confidence)
- **Zero-downtime approach:** [expand/contract pattern per DEPLOYMENT.md §4, or state why not needed]
- **Backfill required:** ☐ Yes → [plan] ☐ No

## 7. Database Gate checklist

- [ ] Entity documented in DATABASE.md §2 (new PR includes the doc update)
- [ ] Tenant scoping & RLS resolved (§3)
- [ ] Soft-delete/retention classified (§4)
- [ ] Migration is zero-downtime or has an explicit, approved exception
- [ ] Reviewed by someone other than the author

**Database Gate:** ☐ Passed — [reviewer, date]
