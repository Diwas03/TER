# 1h, 2h and 24h buy/sell chart

Run `supabase/chart-windows.sql` once in Supabase SQL Editor, after the existing sell-price migration. It preserves all observations and existing RPCs. It returns buy/sell averages together in one bounded query: 30-second buckets for 1h, 1-minute buckets for 2h and 5-minute buckets for 24h. Existing older rows without sell data remain absent from that series.

The chart displays both lines on a shared BTN scale: solid purple for buy, dashed green for sell. Legends, individual low/high ranges, per-point tooltips and a four-column accessible data table distinguish the two. Missing observations break the lines instead of inventing prices. Local device time is used for the horizontal axis. Switching time windows leaves current quote cards and alert settings unchanged.

After GitHub Pages deploys, close old app tabs and reopen. Until the SQL upgrade runs, the frontend tries the existing buy/sell history RPCs using 5-minute buckets and filters the requested hour window locally. It labels that coarser fallback. New query activation requires checking your hosted database; local tests do not apply migrations.

Verification: `node --test tests/*.test.mjs`. Model tests cover window boundaries, shared scale, missing sell data, gaps and legacy merging. Browser verification checks all three range requests, two distinct series, legends, data columns and mobile overflow.
