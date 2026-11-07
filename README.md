# Cervical Validation

Doctor-facing morphology review at `/discovery/`. The current pilot supports attribute ratings, blinded image similarity, within-grade ordering, and definition feedback. Cluster-validation tasks will be added after their sampling audit. The page accepts uncertain, not applicable, and incomparable responses.

The interface and anonymous tissue crops are hosted by GitHub Pages. Case definitions and feedback are held by the access-code-protected `discovery-review` Supabase function. No access codes, patient identifiers, grade labels, model names, selection metadata, or doctor responses are published in this repository. The image files are publicly accessible; they contain anonymous tissue crops and a physical scale bar.

Reviewers first accept the rating definitions. Saves update a review and append history in one transaction. The same browser retains a random reviewer ID for resuming. Administrators have read-only access and can export feedback. A shared access code plus self-reported alias is not verified individual identity.

The completed TCT frontend has been removed. Its database tables, feedback history, and backend source remain intact. The repository root opens `/discovery/`.

Backend source: `supabase/functions/discovery-review/index.ts`; schema: `supabase/discovery-schema.sql`. The service checks access codes before using its server-side credential. Direct anonymous/authenticated database access is revoked and RLS enabled. Never place credentials or private trace manifests in the public repository.
