-- Read-only audit. Run against the intended local database, never inferred UI logs.
-- Only anonymized counts are returned here; these are live data, not coverage claims.
WITH receipts AS (
  SELECT 'L1' AS level, request, result FROM game_events
  UNION ALL SELECT 'L2', request, result FROM l2_events
  UNION ALL SELECT 'L3', request, result FROM l3_events
  UNION ALL SELECT 'L4', request, result FROM l4_events
)
SELECT level,
       request->'action'->>'type' AS action_type,
       COALESCE(request->'action'->>'choice', request->'action'->>'slot', request->'action'->>'door', '') AS action_detail,
       result->>'accepted' AS accepted,
       result->>'code' AS code,
       count(*) AS receipt_count
FROM receipts GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5;

SELECT version_num AS migration FROM alembic_version;
