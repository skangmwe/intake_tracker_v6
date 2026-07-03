# roles.md — McDermott Will & Schulte
## Team Roles, Responsibilities & Handoffs | AI Solutions Team
**Version:** 1.0 | **Last Updated:** April 2026 | **Owner:** AI Solutions Lead

---

## PURPOSE

This file tells Claude who it is working with, what that person is responsible for, and how to calibrate responses accordingly. When a team member opens a project in Claude Code or Claude Code, Claude reads this file and adjusts its behavior — the depth of explanation it offers, the type of output it produces, and the scope of work it engages with — to match the role of the person it is speaking with.

**For Claude:** Before responding to any request, consider the role of the person you are speaking with. If unclear, ask. Never assume a Developer's request should be handled the same way as an Analyst's, or that a QA tester needs the same output format as a partner-facing communication.

---

## THE TEAM

McDermott Will & Schulte's AI Solutions team includes six defined roles. Each has a distinct function in the solution lifecycle. No role should perform work that belongs to another without explicit coordination.

---

## ROLE 1: AI SOLUTIONS ANALYST

### Who They Are
The Analyst is the front door to every solution. They own the relationship with the requesting practice group, department, or client team. They gather requirements, design the AI layer of the solution, and are responsible for the quality of Claude's output throughout the project. There are three Analyst teams:

- **Practice Groups & Client Solutions** — builds solutions for legal practice groups and client-facing work
- **Firm Operations** — builds solutions for internal business functions (accounting, finance, HR, administration)
- **Enterprise Solutions** — builds firm-wide tools used across multiple teams and functions

### Primary Responsibilities
- Own the solution-requirements.md for every solution they lead — from first draft to production
- Conduct the product-requirements-gathering intake using the product-requirements-gathering skill
- Design the AI layer: define the prompt strategy, solution logic, and workflow steps
- Build and test Tier 1 solutions end-to-end in Claude Code without developer involvement
- For Tier 2 and 3 solutions: build and validate the AI layer in Claude Code, then hand off to the Developer with a complete solution design and tested prompts
- Maintain the solution-requirements.md Change Log for all requirement changes
- Facilitate stakeholder review (UAT) with the business requestor
- Own the solution in maintenance — update the template when requirements change

### Skills Used
- product-requirements-gathering (primary — every new solution)
- docx, pptx, xlsx, pdf (solution outputs)
- internal-comms (status updates, stakeholder communications)
- product-management:write-spec (when a formal PRD is needed for Tier 2/3 handoffs)
- product-management:stakeholder-update (for leadership and requestor communications)
- schedule (for Tier 1 solutions that need recurring automation)

### How Claude Should Respond to an Analyst
- Lead with the practical next step — Analysts need to move, not study
- When a new solution is described, invoke the product-requirements-gathering skill immediately
- Reference the solution-requirements.md at every stage — it is the Analyst's primary working artifact
- Flag data sensitivity issues proactively — Analysts may not always think to raise them
- Do not assume technical knowledge about APIs, infrastructure, or deployment — explain clearly when these topics arise
- Offer to complete tasks (fill the template, draft the prompt, write the spec) rather than just advising on how to do them

### Scope Boundaries — What Analysts Do NOT Own
- Writing production code or infrastructure
- Making deployment decisions or managing pipeline environments
- Approving solutions for production without QA sign-off and required stakeholder approvals
- Changing an approved solution's prompt in production without logging the change and re-testing

### Escalation Path
| Situation | Escalate To |
|---|---|
| Data appears privileged and Section 11 is incomplete | AI Solutions Lead |
| Requested tool is not on APPROVED-INTEGRATIONS.md | IT Department |
| Requestor wants a legal conclusion in the output | Partner / AI Solutions Lead |
| Solution scope has grown beyond original Tier assignment | AI Solutions Lead |
| Compliance question arises (HIPAA, privilege, etc.) | AI Solutions Lead → Legal/Compliance |

---

## ROLE 2: UI/UX DESIGNER

### Who They Are
The Designer translates solution designs into interface specifications. They are involved in solutions where the end user interacts with a visual interface — a form, a portal, a dashboard, or a branded output template. They are not involved in every solution; Tier 1 solutions often do not require a Designer.

### Primary Responsibilities
- Review Claude-generated document outputs for usability, accessibility, and alignment with firm design standards
- Produce UI specifications for Tier 2 and Tier 3 solutions that require a custom interface
- Work with the Analyst to define what "good output looks like" in Section 5 of the solution-requirements.md
- Validate that output templates (Word, PowerPoint, email) meet the firm's visual standards

### Skills Used
- docx, pptx (reviewing and refining output templates)
- wireframe-to-spec (when built — converts mockups to developer-ready specs)

### How Claude Should Respond to a Designer
- Focus on output format, visual structure, and user experience — not on prompt engineering or data handling
- When a Designer describes a layout or interface, help translate it into a structured specification
- Reference the solution-requirements.md Section 5 (Outputs & Success Criteria) as the design brief
- Flag if a proposed design conflicts with the constraints in Section 6 of the template

### Scope Boundaries — What Designers Do NOT Own
- Prompt engineering or changes to solution logic
- Data sensitivity decisions
- Approval to deploy a solution

### Escalation Path
| Situation | Escalate To |
|---|---|
| Design requirement conflicts with solution constraints | Analyst |
| Accessibility or compliance question about the interface | AI Solutions Lead → Legal/Compliance |
| Design scope has expanded beyond the solution requirements | Analyst |

---

## ROLE 3: DEVELOPER

### Who They Are
The Developer builds the infrastructure layer of Tier 2 and Tier 3 solutions. They receive a working, tested AI layer from the Analyst and wrap it in the infrastructure it needs to run at scale, automatically, or integrated with firm systems. Developers work primarily in Claude Code, not Claude Code.

### Primary Responsibilities
- Receive the Analyst's completed solution-requirements.md and finalized prompts as their primary brief
- Build integrations with approved firm systems (SharePoint, iManage, Outlook/Exchange, etc.)
- Implement scheduling, authentication, access controls, and audit logging
- Lead development on all Tier 3 solutions from the start, in collaboration with the Analyst
- Maintain the DEVOPS-PIPELINE.md and manage the deployment pipeline
- Use the engineering:deploy-checklist skill before every production deployment

### Skills Used
- engineering:architecture (design decisions and ADRs)
- engineering:code-review (before merging any solution code)
- engineering:debug (when behavior diverges from expected)
- engineering:deploy-checklist (before every deployment)
- engineering:documentation (technical docs, runbooks, READMEs)
- engineering:system-design (for Tier 3 solution architecture)
- engineering:testing-strategy (in coordination with QA)

### How Claude Should Respond to a Developer
- Be technically precise — Developers do not need simplified explanations of API patterns, system design, or infrastructure concepts
- Reference the solution-requirements.md as the source of requirements — do not redesign the solution; implement what is specified
- Flag if an implementation approach would conflict with constraints in the template (especially Section 6 and Section 11)
- When security or compliance questions arise in the code, flag them immediately — do not proceed with an approach that may violate APPROVED-INTEGRATIONS.md or data handling rules
- Use the engineering plugin skills proactively when the work warrants them

### Scope Boundaries — What Developers Do NOT Own
- Redesigning the AI layer or changing prompt logic without Analyst coordination
- Deciding what data the solution will process — that is defined in the solution-requirements.md
- Approving a solution for business use — that belongs to the Analyst, stakeholders, and QA
- Skipping deployment checklist steps to accelerate a release

### Escalation Path
| Situation | Escalate To |
|---|---|
| Implementation requires a tool not in APPROVED-INTEGRATIONS.md | IT Department |
| Prompt logic in the template appears incorrect or incomplete | Analyst |
| Security concern identified during build | IT Department → AI Solutions Lead |
| Infrastructure requirement beyond current pipeline capability | IT / DevOps Lead |

---

## ROLE 4: QA

### Who They Are
QA validates that solutions work correctly, safely, and as specified before they reach production. For AI solutions, QA must go beyond functional testing — it must cover hallucination risks, prompt injection vulnerabilities, data sensitivity handling, and output consistency across varied inputs.

### Primary Responsibilities
- Generate a tailored test plan from the solution-requirements.md using the engineering:testing-strategy skill
- Test against the acceptance criteria defined in Section 5 of the solution-requirements.md
- Run hallucination testing, edge case testing, and prompt injection checks on every solution
- Validate that data sensitivity handling matches Section 4 and Section 11 of the template
- Document test results and record QA sign-off in Section 9 (Approvals Required) of the template
- Flag any defects to the Developer and, if design-level issues are found, to the Analyst

### Skills Used
- engineering:testing-strategy (test plan generation)
- qa-test-plan (when built — AI-specific test plan generation)
- docx, xlsx (test documentation and results reporting)

### How Claude Should Respond to QA
- Be specific and evidence-based — QA needs precise, reproducible results
- When generating test cases, always trace them to the acceptance criteria in Section 5 of the solution-requirements.md
- Flag any output that could be a hallucination (content not found in the source material) — never dismiss it
- For prompt injection tests, be thorough — test both obvious and subtle attempts
- Do not suggest that QA skip or abbreviate testing for time reasons

### Scope Boundaries — What QA Does NOT Own
- Fixing defects — QA documents and routes them; Developers fix
- Changing acceptance criteria — that belongs to the Analyst and requestor
- Approving a solution for business use — QA sign-off is one input; business stakeholder approval is separate

### Escalation Path
| Situation | Escalate To |
|---|---|
| Defect appears to be a prompt logic issue | Analyst |
| Defect appears to be an infrastructure or code issue | Developer |
| Solution fails data sensitivity tests | AI Solutions Lead → Analyst |
| Security vulnerability discovered during testing | IT Department → AI Solutions Lead |

---

## ROLE 5: AI SOLUTIONS LEAD

### Who They Are
The AI Solutions Lead owns the team's standards, configuration, skills library, and overall solution quality. They manage the AI Solutions Analysts and are responsible for the health of the enterprise Claude environment — `.claude/CLAUDE.md`, `.claude/rules/product/standards.md`, `.claude/rules/product/roles.md`, and the skills installed in `.claude/skills/`.

### Primary Responsibilities
- Maintain and update `.claude/CLAUDE.md`, `.claude/rules/product/standards.md`, and `.claude/rules/product/roles.md`
- Review and approve new skills before installation using the skill-creator skill
- Assign solution tier classifications when Analysts are uncertain
- Escalation point for all compliance, privilege, and data sensitivity questions from Analysts
- Coordinate with IT on APPROVED-INTEGRATIONS.md updates
- Conduct periodic reviews of solution quality across the portfolio

### Skills Used
- skill-creator (building and improving skills)
- All skills used by Analysts (for review and quality assurance)
- product-management:roadmap-update (managing the solution portfolio)
- product-management:metrics-review (tracking team and solution performance)

### How Claude Should Respond to the AI Solutions Lead
- Treat requests from the Lead as potentially affecting the full team configuration — flag broader implications when relevant
- When asked to review or improve a skill, use the skill-creator skill and be thorough
- Surface patterns across solutions when the Lead is reviewing the portfolio (e.g., common [PENDING] items, recurring escalations)

---

## ROLE 6: IT / DEVOPS

### Who They Are
IT owns the APPROVED-INTEGRATIONS.md and the security review process. DevOps owns the DEVOPS-PIPELINE.md and the deployment infrastructure. Both roles are involved in Tier 2 and Tier 3 solutions and are mandatory for any solution that connects to firm systems.

### Primary Responsibilities
- **IT:** Review and approve tools, MCPs, and APIs before they are added to APPROVED-INTEGRATIONS.md. Conduct security reviews before Tier 2 and Tier 3 solutions are deployed to production.
- **DevOps:** Maintain and update DEVOPS-PIPELINE.md. Manage environments (dev, staging, prod). Execute or supervise production deployments.

### How Claude Should Respond to IT/DevOps
- Be technically precise — assume full infrastructure and security knowledge
- When discussing integrations, always reference APPROVED-INTEGRATIONS.md explicitly
- For deployment conversations, reference DEVOPS-PIPELINE.md and use the engineering:deploy-checklist skill

---

## HANDOFF MATRIX

| Stage | Owner | Hands Off To | Handoff Artifact |
|---|---|---|---|
| Requirements Intake | AI Solutions Analyst | Designer (if UI needed), Developer (if Tier 2/3) | Completed solution-requirements.md |
| Solution Design | AI Solutions Analyst | Developer | Solution design doc + finalized prompts in project folder |
| UI/UX Specification | UI/UX Designer | Developer | UI specification document |
| Development | Developer | QA | Deployed build in dev/staging environment |
| QA & Testing | QA | Analyst + Stakeholder | Test results + QA sign-off in Section 9 of template |
| Stakeholder Review (UAT) | Analyst + Requestor | Approvers (IT, Legal, Exec) | Updated template with UAT sign-off |
| Approvals | IT / Legal / Exec Sponsor | Developer | All approvals confirmed in Section 9 of template |
| Production Deployment | Developer | Analyst (ownership transfer) | Deployed solution + deployment notes |
| Maintenance | AI Solutions Analyst | (cycle restarts on change) | Updated solution-requirements.md with Change Log entry |

---

## HOW CLAUDE DETERMINES WHO IT IS WORKING WITH

Claude infers the active role from context — the type of request being made, the language used, and the section of work being discussed. If unclear, Claude asks: *"Are you working on this as the Analyst, Developer, or in another role? That'll help me give you the right kind of response."*

Claude does not require a formal role declaration at the start of every session. Context is usually sufficient. However, if the same person is performing work across multiple roles in one session (e.g., an Analyst who also codes), Claude should ask which hat they are wearing for each significant task.

---

*This file is maintained by the AI Solutions Lead. Changes require review and must be logged with date and rationale.*
