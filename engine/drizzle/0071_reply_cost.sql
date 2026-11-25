-- A conversation's result line kept only `costUsd`, the SDK's running total for the whole conversation, and the page
-- showed it beside the time one reply took, as if it were that reply's cost. A result now also carries `stepUsd` (the
-- reply alone) and `totalUsd` (the conversation so far); this works both out for the results already recorded, the
-- same way reply-cost.ts does: the difference from the result before, or the whole figure where the total started again.
WITH r AS (
  SELECT "id", "session_id", ("payload"->>'costUsd')::numeric AS c,
    lag(("payload"->>'costUsd')::numeric) OVER (PARTITION BY "session_id" ORDER BY "id") AS prev
  FROM "session_message"
  WHERE "kind" = 'result' AND ("payload"->>'costUsd')::numeric > 0
), s AS (
  SELECT "id", "session_id", CASE WHEN prev IS NULL OR c < prev THEN c ELSE c - prev END AS step FROM r
), t AS (
  SELECT "id", step, sum(step) OVER (PARTITION BY "session_id" ORDER BY "id") AS total FROM s
)
UPDATE "session_message" m
SET "payload" = m."payload" || jsonb_build_object('stepUsd', round(t.step, 6), 'totalUsd', round(t.total, 6))
FROM t
WHERE m."id" = t."id" AND NOT (m."payload" ? 'stepUsd');
