# Schema migration measurement

Measured locally on 2026-10-11 using protocol v9: one idle guest and seven bots,
60.006 seconds, without WebSocket compression. This is application payload
measurement, not a physical phone or cellular-carrier measurement.

| Metric | Result |
| --- | ---: |
| State patches | 1,199 |
| Updates per second | 19.98 |
| Average patch payload | 211.49 bytes |
| Received payload per minute | 0.254 MB |
| Equivalent full MessagePack snapshots per minute | 7.597 MB |
| Reduction for the same states | 96.66% |
| Initial full state, reported separately | 4,944 bytes |

The comparison encodes every decoded state using Colyseus's former
`ROOM_DATA / snapshot` MessagePack envelope. It compares identical states at
identical cadence, rather than unrelated matches. Initial full state, handshake,
assets, outgoing input, and WebSocket/TLS/TCP overhead are excluded from the
per-minute figures. The first incremental patch may repeat newly created state.
Results vary with combat, entities, and player count; this is not a load test.

Reproduce from the repository root:

```powershell
node --import tsx scripts/measure-bandwidth.mjs --local 60
```

Set `BANDWIDTH_REPORT` to a file path to save JSON. Replace `--local` with a
protocol-v9 server URL to measure a deployed release; the currently deployed v8
server must not be tested with the v9 client until the matching release is live.

The server uses stable ID-keyed Schema maps and preserves simulation ordering
with an explicit order field. This avoids array insertion replay on late joins.
The browser reconstructs independent plain snapshots for the existing 100 ms
interpolation buffer. Numeric simulation fields use float64; simulation, input,
and patch cadence are unchanged. Patches run on the existing simulation clock
at 50 ms intervals, not a second native timer.

Regression coverage includes exact encode/decode equality, optional field
clearing, additions/removals/reordering, retained historical frames, unchanged
state emitting no patch, and full-state joins followed by pending patches.

Validation completed: 59 server tests, 19 frontend unit tests, and all 67 browser
tests passed, including desktop inputs, mobile two-thumb movement/fire, rotation,
reconnection, account isolation, and results. The full production build passed.
Browser tests now leave matches through the menu between cases to avoid reserved
seats leaking into later matchmaking tests. Their mobile header expectation was
corrected to the existing 52 px CSS layout. No deployment was performed.
