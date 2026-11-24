-- An unanswered decision has no answer, so what was written beside it is not "why this answer": it is why the question
-- is asked. Before decisions had a background, an agent asking a question put that in `body`. Move it to `background`,
-- where the form shows it. Only where there is no background already; a proposed answer's `body` is why that answer,
-- and stays.
UPDATE "note" SET "background" = "body", "body" = '' WHERE "kind" = 'decision' AND "status" = 'open' AND "body" <> '' AND ("background" IS NULL OR "background" = '');
