# 1h, 2h and 24h buy/sell chart

Run `supabase/chart-windows.sql` once in Supabase SQL Editor, after the existing sell-price migration. It preserves all observations and existing RPCs. It returns buy/sell averages together in one bounded query: 30-second buckets for 1h, 1-minute buckets for 2h and 5-minute buckets for 24h. Existing older rows without sell data remain absent from that series.

The chart displays both lines on a shared BTN scale: solid purple for buy, dashed green for sell. Legends, individual low/high ranges, per-point tooltips and a four-column accessible data table distinguish the two. Missing observations break the lines instead of inventing prices. Local device time is used for the horizontal axis. Switching time windows leaves current quote cards and alert settings unchanged.

After GitHub Pages deploys, close old app tabs and reopen. If the new query is unavailable, the frontend reads existing observations with bounded keyset pagination and builds the requested averages locally. It labels this fallback and refuses to silently display truncated history. Running the SQL upgrade restores the more efficient server-side query. New query activation requires checking your hosted database; local tests do not apply migrations.

Verification: `node --test tests/*.test.mjs`. Model tests cover window boundaries, shared scale, missing sell data, gaps and legacy merging. Browser verification checks all three range requests, two distinct series, legends, data columns and mobile overflow.

If no graph appears, the latest SQL also reloads the PostgREST schema cache. Recent stored rows are required: current TER quote cards alone do not create history. The chart now distinguishes an empty window from a failed database read. Diagnose without revealing secrets:

```sql
select count(*) filter (where observed_at >= now() - interval '1 hour') as readings_last_hour,
       max(observed_at) as latest_reading
from public.price_observations;
select count(*) as chart_buckets from public.price_history_window(1);
```

Zero recent rows means the scheduled collector needs investigation. A failed second query identifies the history function issue. Positive counts with a failed app read can indicate public-key/RLS access or an old frontend deployment. Admin SQL access alone does not establish anonymous API access.
