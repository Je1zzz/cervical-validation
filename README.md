# Cervical Validation

Doctor-facing TCT report review interface at `/tct/`.

Static HTML, CSS and JavaScript; GitHub Pages hosts the interface. Case records and feedback are stored in a separate access-code-protected service. This repository contains no patient records or access codes.

The live backend uses Supabase project `cznnzigxstshvzosypch`, Edge Function `tct-review`. Source is in `supabase/functions/tct-review/index.ts`. The SQL file describes the initial schema and includes a fictional test case; access hashes and real case records must be provisioned privately. Direct anonymous/authenticated table access is revoked; the function verifies the access code before using its server-side database credential. Review saves and history append in one database transaction.

The current interface uses the `patient-tct-review` Edge Function and one row per patient. The spreadsheet contains name, patient ID, original age values, hospital, original scan dates, preoperative TCT, postoperative TCT, corrected preoperative TCT, and corrected postoperative TCT. The two correction columns begin blank and accept free text; edits save on leaving a cell, with a manual save button and visible failure/retry status. Previously saved corrections restore on login. Administrators can export patient feedback as CSV using their separate access code. Multiple original age/date values are preserved instead of choosing one. Patient grouping is by patient ID, never by name.

Patient schema and function source are in `supabase/patient-schema.sql` and `supabase/functions/patient-tct-review/`. Case/feedback/history tables use the `cv_patient_` prefix. The earlier WSI-level tables and endpoint remain for traceability. Only consolidate patients when both original TCT texts and their categories agree; conflicting original reports require separate review before importing.

Dates shown are original WSI scan dates, not TCT examination dates. The interface is for report reconciliation, not automated diagnosis. Reviewer progress is associated with a random identifier in the current browser; use the same browser to resume.
