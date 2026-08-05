# API Spec Template

Copy this file per new endpoint or endpoint group. Covers lifecycle phase 9 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **API Gate**. Must comply with [API_GUIDELINES.md](API_GUIDELINES.md) — this template doesn't restate those rules, it's where you demonstrate the specific endpoint follows them.

---

## API: [e.g., "POST /v1/assessment-attempts"]

**Feature spec:** [link]
**Author:** [name]
**API Gate reviewer:** [name]

## 1. Endpoint

|                          |                                                                 |
| ------------------------ | --------------------------------------------------------------- |
| Method                   |                                                                 |
| Path                     |                                                                 |
| Auth required            | Yes/No — role(s):                                               |
| Idempotency-Key required | Yes/No (API_GUIDELINES.md §6)                                   |
| Rate limit class         | Standard / AI-invoking / Unauthenticated (API_GUIDELINES.md §7) |

## 2. Request

```json
// Request body / query params
```

**Validation:** [name the Zod schema in `packages/validation` — new or existing]

## 3. Response

```json
// 2xx response shape
```

**Pagination (if a collection):** Cursor or offset (API_GUIDELINES.md §4) — which, and why.

## 4. Error responses

_Every error this endpoint can return, using the registry in API_GUIDELINES.md §3. A new error code is only added if genuinely novel — check the registry first._

| HTTP status | `error.code` | When |
| ----------- | ------------ | ---- |
|             |              |      |

## 5. Tenant/ownership scoping

_If this endpoint touches tenant-scoped or user-owned data: what's the scoping rule, and does the underlying table have an RLS policy (MULTITENANCY.md)? A "yes" here without a corresponding DATABASE_CHANGE_TEMPLATE.md RLS section is a Security Gate failure._

## 6. BFF/aggregation classification

_Is this a standard resource endpoint or a dashboard aggregation endpoint (API_GUIDELINES.md §8)? If aggregation, name it explicitly as such._

## 7. Versioning impact

_Additive (no version bump) or breaking (new major version + deprecation plan per API_GUIDELINES.md §10)?_

## 8. WebSocket variant (if applicable)

_If this is a real-time flow instead of/in addition to REST, define the message `type` values per API_GUIDELINES.md §9 and add them to the catalog if new._

## 9. API Gate checklist

- [ ] Follows resource naming & verb conventions (API_GUIDELINES.md §1–2)
- [ ] Error codes come from the registry or extend it deliberately (§4 above)
- [ ] Tenant/ownership scoping defined and RLS-backed if applicable (§5)
- [ ] OpenAPI spec generates correctly from `@nestjs/swagger` decorators (API.md §5)
- [ ] Reviewed by someone other than the author

**API Gate:** ☐ Passed — [reviewer, date]
