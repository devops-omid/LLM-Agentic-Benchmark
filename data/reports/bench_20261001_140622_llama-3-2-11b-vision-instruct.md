# LLM Speed & Latency Benchmark Report

- **Run Identifier:** `bench_20261001_140622_llama-3-2-11b-vision-instruct`
- **Execution Timestamp:** Thu, 01 Oct 2026 14:06:34 GMT
- **Model Target:** `Llama 3.2 11B Vision Instruct` (`meta/llama-3.2-11b-vision-instruct`)
- **Inference Engine:** `NVIDIA_NIM` via `https://integrate.api.nvidia.com/v1`

---

## 1. Workload Specification

| Parameter | Configured Value | Description |
| :--- | :--- | :--- |
| **Model** | `meta/llama-3.2-11b-vision-instruct` | Target model architecture |
| **Input Context** | `256 tokens` | Calibrated prefill prompt payload |
| **Target Completion** | `64 tokens` | Target generated output per stream |
| **Concurrency Ceiling** | `4 streams` | Concurrent execution semaphore limit |
| **Total Test Requests** | `4 requests` | Total synthetic runs planned |
| **Sampling Temperature** | `0.1` | Greedy/Creative generation balance |

---

## 2. Key Performance Indicators (KPIs)

| Performance Metric | Measured Value | Unit / Definition |
| :--- | :--- | :--- |
| **Aggregate Cluster Throughput** | **21.43** | `tokens/sec` across all active streams |
| **Mean Per-Stream Throughput** | **33.75** | `tokens/sec` per client connection |
| **Time to First Token (TTFT Mean)** | **2335.25** | `ms` prefill & queue transit |
| **Time to First Token (TTFT p50)** | **172** | `ms` median interactive responsiveness |
| **Inter-Token Latency (ITL Mean)** | **32.31** | `ms` chunk-to-chunk delta |
| **Total Tokens Processed** | **1,280** | `1,024` prompt + `256` completion |
| **Total Benchmark Wall Time** | **11.95** | `seconds` total elapsed test time |
| **Success Rate** | **100.0%** | `4 / 4` completed (0 errors) |

---

## 3. Latency Distribution & Tail Percentiles

Detailed distribution across completed requests:

### Time to First Token (TTFT)
* **p50 (Median):** `172 ms`
* **p90:** `6238.8 ms`
* **p95:** `7538.4 ms`
* **p99 (Tail):** `8578.08 ms`
* **Min / Max:** `159 ms` / `8838 ms`

### Inter-Token Latency (ITL)
* **p50 (Median):** `24 ms`
* **p90:** `36.9 ms`
* **p95:** `46.45 ms`
* **p99 (Tail):** `142.49 ms`
* **Min / Max:** `0 ms` / `904 ms`

---

## 4. Architectural Analysis & Concurrency Insights

Operating at moderate concurrency (4 workers), stream responsiveness was snappy with median TTFT of **172 ms** and average per-stream generation speed of **33.75 TPS**.

* **Prefill Saturation:** Input context of **256 tokens** required approximately **172 ms** for KV-cache initialization on Llama 3.2 11B Vision Instruct.
* **Decode Efficiency:** Generation inter-token latency stabilized around **24 ms** per chunk, yielding **33.75 tokens/sec** per single client thread.
* **Error Resilience:** Rate limit and socket handling registered **0** failed attempts under **4** concurrent worker pressure.

---
*Report generated automatically by LLM Agentic Speed Benchmark Engine.*
