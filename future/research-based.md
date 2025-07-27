# Product Requirements Document (PRD): Self-Improving Agent Layer for Task-Kanban-MCP

**Version:** 3.2
**Date:** July 27, 2025
**Author:** Product Management Team

---

## 1. Executive Summary

This PRD defines the implementation of a self-improving intelligence layer for the `task-kanban-mcp` system. It introduces reflection-based retry loops, contextual bandit routing, vector-based memory, prompt adaptation, tool feedback, and future multi-agent extensions. These enhancements allow AI agents (e.g., Claude Code, Cursor) to continuously learn from failures, optimize their task execution, and adapt over time.

---

## 2. Goals and Objectives

### Primary Goals:

* Improve agent reliability, reduce repeated errors, and optimize agent-task matching
* Integrate mechanisms for post-task reflection and retry based on semantic feedback
* Enable agents to retrieve and apply learned patterns from past completions
* Dynamically tune prompts based on historical performance and task similarity

### Key Objectives:

* Reduce test/lint/type errors by 30%
* Improve retry success rate to 90%
* Route 80% of tasks to optimal agent after 30 days
* Increase prompt efficiency by 25% (tokens vs outcome)

---

## 3. Features and Functional Requirements

### 3.1 Reflection and Retry

* **Reflect on Failure:** Add `reflect_on_task(task_id, reflection)` tool; store structured reflections in ChromaDB.
* **Retry with Feedback:** Introduce `retry_task(task_id)` which uses the reflection as context enhancement.
* **Automatic Trigger:** Retry is triggered upon test/lint failure and capped to 2 retries.
* **Vectorized Storage:** Reflections are embedded and stored with metadata (agentId, taskType, successScore).

### 3.2 Vector-Based Memory

* **Memory Embeddings:** Use `text-embedding-ada-002` to vectorize code, tasks, notes, reflections.
* **Similarity Search:** Support `get_similar_patterns(context)` tool for contextual task retrieval.
* **Memory Cleanup:** Implement a weekly job to prune low-salience or outdated chunks.
* **Metadata Enrichment:** Embed metadata like taskType, agentId, timestamp, and successScore.

### 3.3 Adaptive Task Routing

* **Bandit Strategy:** Implement LinUCB or Thompson Sampling with warm-start priors.
* **Routing Score Table:** Maintain `RoutingScore(agentId, taskType, avgSuccess, history)`.
* **Live Routing:** Use contextual bandit to select the best agent for incoming task based on logs.
* **Exploration Factor:** Ensure 5–10% of tasks explore alternate agents to avoid overfitting.

### 3.4 Prompt Optimization

* **CoT + Self-Consistency:** Chain-of-thought mode generates 3–5 responses; majority vote is used.
* **Few-shot Prompting:** `get_similar_patterns()` injects top-k historical completions by similarity.
* **Tree-of-Thoughts:** Optional tool generates multiple branches with feedback scoring per path.
* **Dynamic Warnings:** Retrieve reflection-based advice and insert inline in prompt as a guardrail.
* **Prompt Comparison Utility:** Add CLI command `kanban prompt compare --task <id>` to analyze different prompt versions used on similar tasks with metrics (e.g., retry rate, success %, duration).
* **Prompt Clustering Utility:** Add CLI command `kanban prompt cluster` to extract and group prompt variants from memory by semantic similarity using TF-IDF + KMeans, with optional PCA visualization.

### 3.5 Tool Use and Evaluation

* **Sandboxed Test Runner:** Execute code safely with snapshot isolation (Deno or dockerized).
* **Inline Evaluation:** Agent triggers `evaluate_task_output(task_id, result)` for automated scoring.
* **Result Tracing:** Store test logs, assertions, and retry cause for postmortem analysis.
* **Error-Aware Feedback:** Insert tool output into retry CoT as reflection or prompt modifier.

### 3.6 Future Extensions (Multi-Agent System)

* **Critic Role Agent:** One agent writes, another critiques (`multi-agent debate pattern`).
* **Agent Messaging:** Log inter-agent messages with `intent`, `taskId`, `summary`, and embed.
* **Cross-Agent Pattern Sharing:** Tasks and notes from one agent contribute to global memory.

---

## 4. Technical Architecture

```plaintext
MCP Agent
    ↳ Reflects after failure → reflect_on_task()
    ↳ Triggers retry with retry_task() if tool feedback fails
    ↳ Routes through bandit → select agent with best performance
    ↳ Prompts include: CoT, Reflection, Examples

     ┌──────────────┐
     │  CLI / MCP   │
     └─────┬────────┘
           │
    ┌──────▼──────┐          ┌──────────────────────────┐
    │ Vector Store│<───────→ │ Reflection Embedding API │
    └──────┬──────┘          └──────────────────────────┘
           │
           ▼
    ┌──────────────┐         ┌──────────────────────────┐
    │ Task History │         │  Performance Score Table │
    └──────────────┘         └──────────────────────────┘
```

---

## 5. Data Models

### Reflection

```ts
interface Reflection {
  taskId: string;
  agentId: string;
  reflectionText: string;
  embedding: number[];
  timestamp: Date;
  taskType: string;
  successScore?: number;
}
```

### Performance Log

```ts
interface PerformanceLog {
  taskId: string;
  agentId: string;
  tokensUsed: number;
  retries: number;
  testFailures: number;
  durationMs: number;
  contextSize: number;
  reward?: number;
}
```

### Routing Score

```ts
interface RoutingScore {
  agentId: string;
  taskType: string;
  avgSuccess: number;
  scoreHistory: number[];
  lastUpdated: Date;
}
```

---

## 6. Timeline

| Phase | Deliverables                             | Duration   |
| ----- | ---------------------------------------- | ---------- |
| 1     | Reflection tools + schema                | Week 1–2   |
| 2     | Vector memory integration                | Week 3–4   |
| 3     | Retry loop + logging infra               | Week 5–6   |
| 4     | Bandit routing module                    | Week 7–8   |
| 5     | Prompt tuning + CoT engine               | Week 9–10  |
| 6     | Tool runner + test verifier              | Week 11–12 |
| 7     | Prompt comparison + clustering utilities | Week 13–14 |
| 8     | SLA compliance, docs                     | Week 15    |

---

## 7. Success Criteria

* ≥90% retry success after agent reflection
* ≥25% reduction in total task error volume (type/lint/test)
* ≤200ms avg vector memory fetch latency
* ≥80% routing accuracy for bandit-assigned agents
* ≥70% of prompts include semantic memory augmentation
* ≥3 clusters found with `kanban prompt cluster` and compared via `prompt compare`

---

## 8. Risks and Mitigations

| Risk                                   | Mitigation                                |
| -------------------------------------- | ----------------------------------------- |
| Reflections become noisy or repetitive | Use cosine similarity + entropy filter    |
| Bandit underfits or misroutes          | Use warm-start priors + epsilon decay     |
| Retry loops increase cost              | Cap retries, detect duplicate completions |
| Prompt inflation from memory           | Apply prompt compression/summarization    |

---

## 9. Research References

* Reflexion: [https://arxiv.org/abs/2303.11366](https://arxiv.org/abs/2303.11366)
* Self-Refine: [https://arxiv.org/abs/2303.17651](https://arxiv.org/abs/2303.17651)
* MixLLM (Routing): [https://aclanthology.org/2025.naacl-long.545.pdf](https://aclanthology.org/2025.naacl-long.545.pdf)
* Tree-of-Thought: [https://arxiv.org/abs/2305.10601](https://arxiv.org/abs/2305.10601)
* Mirror: [https://aclanthology.org/2024.acl-long.382.pdf](https://aclanthology.org/2024.acl-long.382.pdf)
* Reflection-Reward: [https://arxiv.org/abs/2505.24726](https://arxiv.org/abs/2505.24726)

---

**End of Document**
