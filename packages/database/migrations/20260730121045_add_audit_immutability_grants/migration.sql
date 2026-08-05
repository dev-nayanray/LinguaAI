-- E2-T7: AuditLog/EntitlementChangeLog immutability grants — transcribed
-- verbatim from the E2 design doc, Part 9B (lines 583-590). Both tables
-- currently still carry app_role's T4 blanket
-- "SELECT, INSERT, UPDATE, DELETE ON ALL TABLES" grant; this narrows it
-- specifically for these two tables so immutability holds at the Postgres
-- privilege level, not merely as an application-layer/code-review
-- convention — an application bug or a compromised app_role credential
-- still cannot alter or erase an audit record.

REVOKE UPDATE, DELETE ON "AuditLog", "EntitlementChangeLog" FROM app_role;
GRANT INSERT, SELECT ON "AuditLog", "EntitlementChangeLog" TO app_role;
