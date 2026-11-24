-- Before a decision was a question and its answer, an agent "proposed" one as a single statement, with its options
-- and recommendation in `body`. Those rows are now "proposed" with no answer: the page says "The agent proposes:"
-- and nothing, shows the options as "Why", and the form has nowhere for them. A decision with no answer is an
-- unanswered question, and what was written beside it is its background.
UPDATE "note" SET "status" = 'open', "background" = CASE WHEN "background" IS NULL OR "background" = '' THEN NULLIF("body", '') ELSE "background" END, "body" = CASE WHEN "background" IS NULL OR "background" = '' THEN '' ELSE "body" END
WHERE "kind" = 'decision' AND "status" = 'proposed' AND ("answer" IS NULL OR "answer" = '');
