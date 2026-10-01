# LLM Speed & Latency Benchmark Report

- **Run Identifier:** `bench_20261001_145322_llama-3-2-11b-vision-instruct`
- **Execution Timestamp:** Thu, 01 Oct 2026 14:53:27 GMT
- **Model Target:** `Llama 3.2 11B Vision Instruct` (`meta/llama-3.2-11b-vision-instruct`)
- **Inference Engine:** `NVIDIA_NIM` via `https://integrate.api.nvidia.com/v1`

---

## 1. Workload Specification

| Parameter | Configured Value | Description |
| :--- | :--- | :--- |
| **Model** | `meta/llama-3.2-11b-vision-instruct` | Target model architecture |
| **Input Context** | `1,024 tokens` | Calibrated prefill prompt payload |
| **Target Completion** | `32 tokens` | Target generated output per stream |
| **Concurrency Ceiling** | `2 streams` | Concurrent execution semaphore limit |
| **Total Test Requests** | `3 requests` | Total synthetic runs planned |
| **Sampling Temperature** | `0.1` | Greedy/Creative generation balance |

---

## 2. Key Performance Indicators (KPIs)

| Performance Metric | Measured Value | Unit / Definition |
| :--- | :--- | :--- |
| **Aggregate Cluster Throughput** | **17.5** | `tokens/sec` across all active streams |
| **Mean Per-Stream Throughput** | **40.77** | `tokens/sec` per client connection |
| **Time to First Token (TTFT Mean)** | **1432.33** | `ms` prefill & queue transit |
| **Time to First Token (TTFT p50)** | **283** | `ms` median interactive responsiveness |
| **Inter-Token Latency (ITL Mean)** | **31.6** | `ms` chunk-to-chunk delta |
| **Total Tokens Processed** | **3,168** | `3,072` prompt + `96` completion |
| **Total Benchmark Wall Time** | **5.49** | `seconds` total elapsed test time |
| **Success Rate** | **100.0%** | `3 / 3` completed (0 errors) |



---

## 3. Latency Distribution & Tail Percentiles

Detailed distribution across completed requests:

### Time to First Token (TTFT)
* **p50 (Median):** `283 ms`
* **p90:** `3135 ms`
* **p95:** `3491.5 ms`
* **p99 (Tail):** `3776.7 ms`
* **Min / Max:** `166 ms` / `3848 ms`

### Inter-Token Latency (ITL)
* **p50 (Median):** `25 ms`
* **p90:** `33 ms`
* **p95:** `38.8 ms`
* **p99 (Tail):** `230.88 ms`
* **Min / Max:** `12 ms` / `517 ms`

---

## 4. Architectural Analysis & Concurrency Insights

Operating at moderate concurrency (2 workers), stream responsiveness was snappy with median TTFT of **283 ms** and average per-stream generation speed of **40.77 TPS**.

* **Prefill Saturation:** Input context of **1024 tokens** required approximately **283 ms** for KV-cache initialization on Llama 3.2 11B Vision Instruct.
* **Decode Efficiency:** Generation inter-token latency stabilized around **25 ms** per chunk, yielding **40.77 tokens/sec** per single client thread.
* **Error Resilience:** Rate limit and socket handling registered **0** failed attempts under **2** concurrent worker pressure.

---
*Report generated automatically by LLM Agentic Speed Benchmark Engine.*
