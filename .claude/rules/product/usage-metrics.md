# usage-metrics.md — Measuring AI Solutions

## AI Solutions Team | McDermott Will & Schulte

**Version:** 1.0 (starter) | **Last Updated:** May 2026 | **Owner:** AI Solutions Lead

---

## PURPOSE

We will deploy AI solutions across attorneys, practice groups, finance, marketing, and operations. Without measurement, we cannot tell which ones are paying off, where the build process is breaking down, or what to invest more or less in. This framework defines what we measure, why, and at what cadence — lightweight enough to actually implement, structured enough to drive portfolio decisions.

**The principle: measure to learn and decide, not to performance-manage.** The goal is portfolio intelligence — knowing which patterns and approaches pay off — not surveillance of individual analysts, developers, or end users.

---

## METRIC CATEGORIES

Five categories, each answering a different question.

### 1. Adoption — Is anyone using what we built?

**What to measure:**

- Active users per solution (daily, weekly, monthly) — unique users who invoked the solution in the period.
- Invocations per solution — total runs / requests / queries.
- Time since last use per solution — flags solutions that have gone cold.
- Distribution by team / Practice Group — where adoption is strong vs. weak.

**Why it matters:** A deployed solution with zero monthly active users is sunk cost. Adoption metrics catch failed launches early and surface solutions that should be promoted to broader audiences.

**How:** Instrument every Tier 2 / 3 solution at deploy time with a usage log (timestamp, user, solution ID, success/failure). For Tier 1, manual sample-based logging in the solution-registry is acceptable.

**Cadence:** Reviewed monthly by AI Solutions Lead. Flagged solutions (cold, declining) reviewed in the quarterly portfolio meeting.

---

### 2. Value — Is the solution actually delivering?

**What to measure:**

- Time saved per invocation (estimated at intake, validated by 30- and 90-day user survey).
- Cost saved per period (time × cost rates, or measured directly where applicable).
- Quality improvement (qualitative, captured in the 90-day requester check-in).
- Throughput change where applicable (e.g., contracts reviewed per week before vs. after).

**Why it matters:** The intake form captures _expected_ value. This loop captures _actual_ value, which is what drives "do more like this" portfolio decisions.

**How:** Pre-deploy, the Analyst records the value hypothesis in solution-requirements.md (already a field in AI_Intake_Form.html). Post-deploy at 30 days and 90 days, send a structured short survey to the primary user group.

**Cadence:** 30-day and 90-day touchpoints per solution, then annually for long-running solutions.

---

### 3. Health — Is the solution behaving correctly?

**What to measure:**

- Error rate — fraction of invocations that failed (technical errors, timeouts, validation failures).
- Escalation rate — fraction of invocations that escalated to a human (for classify/route patterns).
- Defect reports post-deploy — count, severity, time-to-fix.
- Re-intake rate — fraction of deployed solutions that returned to Requirements for material changes (signals intake gaps).

**Why it matters:** Solutions degrade. Models drift. Data sources change. Health metrics catch drift before users complain.

**How:** Errors logged automatically at the application layer (Tier 2 / 3). Defects tracked by QA. Re-intake events tracked in the solution-registry change log.

**Cadence:** Error rates monitored continuously with alerts on threshold breach; reviewed monthly. Defects reviewed in each QA sign-off cycle.

---

### 4. Satisfaction — Are the people we built for happy?

**What to measure:**

- Requester satisfaction at 30 days (1–5 plus optional comment).
- User satisfaction at 30 and 90 days (1–5 plus optional comment).
- Would-recommend score — "would you recommend this to a colleague?" (yes/no, why).
- Friction reports — free-text capture of what's annoying or broken.

**Why it matters:** Adoption alone doesn't tell you if people are _happy_ — sometimes they use it because they have to. Satisfaction signals long-term sustainability and whether the solution is fit for purpose.

**How:** Structured short surveys at 30 / 90-day milestones, delivered through a single channel (email or in-app — pick one and stick with it). Optional "friction button" in the solution UI for ongoing capture.

**Cadence:** 30 / 90 days post-deploy, then annually for long-running solutions.

---

### 5. Portfolio — Are we as a team running well?

**What to measure:**

- Solutions in flight by stage (intake / design / build / QA / deployed / retired).
- Solutions by Solution Tier (distribution across Tier 1 / 2 / 3).
- Solutions by pattern (Extract / Summarize / Draft / Classify-Route / Compare / Generate-from-Template).
- Time-to-value — median days from intake completion to first production use, by tier.
- Intake-to-deploy time by tier (where's the bottleneck?).
- Retire rate — fraction of deployed solutions retired within 12 months.

**Why it matters:** Portfolio-level metrics drive process improvement. If Tier 2 solutions take 4× as long as expected, that's a _process_ problem, not a solution problem. If Extract patterns succeed at 80% and Draft patterns at 30%, that's a pattern-investment signal.

**How:** All sourced from [SOLUTION-REGISTRY.md](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.md) / [SOLUTION-REGISTRY.xlsx](https://mcdermottwillemery.sharepoint.com/sites/AI/SiteAssets/Solutions/Registry/SOLUTION-REGISTRY.xlsx) on SharePoint and the change log. No separate instrumentation required beyond keeping the registry current.

**Cadence:** Reviewed at the quarterly portfolio meeting with all four managers.

---

## INSTRUMENTATION REQUIREMENTS BY TIER

Different tiers need different levels of instrumentation. Match the rigor to the risk.

- **Tier 1** (Analyst-owned, in Claude Code): manual sample-based logging acceptable. Capture in solution-registry when the solution is used and by whom; no per-invocation logging required.
- **Tier 2** (Analyst-built AI layer, Dev-wrapped infrastructure): automated logging required. Every invocation logged with timestamp, user ID, solution ID, success/failure. Defined in `.claude/rules/dev/_core-requirements.md`.
- **Tier 3** (Multi-system, external clients, custom auth): full observability stack required. Logs, metrics, traces, alerts. Real-time error monitoring with escalation. Defined in `.claude/rules/dev/_core-requirements.md`.

---

## DATA HANDLING

Usage logs are firm-internal data and subject to the same sensitivity rules as the solutions themselves.

- Log user identities only where required for adoption analysis. Aggregate to teams or roles where possible.
- **Never log the content** the user submitted or received — only metadata about the invocation (timestamp, success/failure, duration, error type).
- Retention: 24 months for raw logs; aggregated metrics retained indefinitely.
- Practice Groups handling privileged or HIPAA-regulated work may require additional aggregation before metrics are visible outside the group — confirm with Legal before instrumenting.

---

## REVIEW CADENCE — AT A GLANCE

| Cadence                   | What's reviewed                                             | Who                              |
| ------------------------- | ----------------------------------------------------------- | -------------------------------- |
| Continuous                | Error rate alerts (Tier 2 / 3 only)                         | Dev on-call                      |
| Monthly                   | Adoption per solution; cold-solution review                 | AI Solutions Lead                |
| 30 / 90 days per solution | Value and satisfaction surveys                              | Analyst Manager + Solutions Lead |
| Quarterly                 | Full portfolio review                                       | All four managers                |
| Annually                  | Long-running solutions revisited; framework itself reviewed | All four managers                |

---

## OPEN ITEMS BEFORE THIS GOES LIVE

These need to be resolved during the build phase, not at portfolio-decision time:

1. **Instrumentation infrastructure** — where do usage logs live? (A database, a SaaS analytics tool, a firm system.) Dev to scope.
2. **Survey delivery channel** — email, in-app, Slack/Teams? Pick one and stick with it. Multiple channels guarantee response-rate decay.
3. **Dashboard ownership** — who builds and maintains the portfolio dashboard? Likely Solutions Lead with Dev support.
4. **Sensitive-team carveouts** — Practice Groups where even aggregated usage data is too sensitive to expose outside the group. Confirm with Legal.
5. **Survey fatigue policy** — if a user is in three solutions' 30-day windows simultaneously, do they get three surveys? Recommend one consolidated touchpoint per user per month max.

---

_Maintained by the AI Solutions Lead. Reviewed at each quarterly portfolio meeting; the framework itself updated annually as instrumentation patterns mature._
