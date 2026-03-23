# Debug Session: ai-design-platform

## Status
[OPEN]

## Symptom
- UI shows: "生成失败 / 任务超时，请重试"
- Expected: task finishes and shows reference images + Markdown spec

## Repro
- Open Home (/)
- Enter requirement text (any)
- Click "开始生成"
- Wait > 60s until "任务超时，请重试" appears

## Hypotheses (falsifiable)
1. Wikimedia Commons API request hangs or is very slow (no timeout), so backend task stays in `running/searching_images` beyond 60s.
2. Backend task runner throws but error is not persisted quickly (e.g., JSON store write blocked), causing frontend to keep polling `running` until timeout.
3. Frontend polling loop hits a different backend than the one executing tasks (proxy/port mismatch), so it keeps seeing stale `running` state.
4. Frontend polling loop fails to observe `succeeded/failed` due to response caching, so it remains `running` until timeout.
5. Wikimedia response parsing returns unexpected structure, causing an internal hang or repeated retries.

## Evidence Plan
- Instrument backend: task enqueue/run stages, Wikimedia fetch start/end, status, duration, exceptions.
- Instrument frontend: createTask/polling start, task status snapshots, timeout trigger.
- Compare pre-fix vs post-fix logs to confirm root cause.

## Evidence (pre-fix)
- Wikimedia search can return `pagesCount=0` for mixed/long queries, causing `imagesCount=0` and empty gallery.
- When accessed via `http://127.0.0.1:<port>`, dev server may refuse connections (IPv6 localhost binding), leading to frontend "请求失败".
