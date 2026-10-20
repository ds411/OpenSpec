Feature: docs-agent-instructions
  Define authoring standards for generated agent instruction docs so templates, examples, and validation checklists are clear and copy-ready.

  @REQ-0152
  Rule: Quick Reference Placement
    The AI instructions SHALL begin with a quick-reference section that surfaces required file structures, templates, and formatting rules before any narrative guidance.

    Scenario: Loading templates at the top
      When `openspec/AGENTS.md` is regenerated or updated
      Then the first substantive section after the title SHALL provide copy-ready headings for `proposal.md`, `tasks.md`, spec deltas, and scenario formatting
      And link each template to the corresponding workflow step for deeper reading

  @REQ-0153
  Rule: Embedded Templates and Examples
    `openspec/AGENTS.md` SHALL include complete copy/paste templates and inline examples exactly where agents make corresponding edits.

    Scenario: Providing file templates
      When authors reach the workflow guidance for drafting proposals and deltas
      Then provide fenced Markdown templates that match the required structure (`## Why`, `## ADDED Requirements`, `#### Scenario:` etc.)
      And accompany each template with a brief example showing correct header usage and scenario bullets

  @REQ-0154
  Rule: Pre-validation Checklist
    `openspec/AGENTS.md` SHALL offer a concise pre-validation checklist that highlights common formatting mistakes before running `openspec validate`.

    Scenario: Highlighting common validation failures
      When a reader reaches the validation guidance
      Then present a checklist reminding them to verify requirement headers, scenario formatting, and delta sections
      And include reminders about at least `#### Scenario:` usage and descriptive requirement text before scenarios

  @REQ-0155
  Rule: Progressive Disclosure of Workflow Guidance
    The documentation SHALL separate beginner essentials from advanced topics so newcomers can focus on core steps without losing access to advanced workflows.

    Scenario: Organizing beginner and advanced sections
      When reorganizing `openspec/AGENTS.md`
      Then keep an introductory section limited to the minimum steps (scaffold, draft, validate, request review)
      And move advanced topics (multi-capability changes, archiving details, tooling deep dives) into clearly labeled later sections
      And provide anchor links from the quick-reference to those advanced sections

  @REQ-0156
  Rule: Behavior-First Spec Authoring Guidance
    Agent instruction docs SHALL explicitly teach that specs capture observable behavior contracts, while implementation details belong in design/tasks.

    Scenario: Distinguishing spec vs implementation content
      When `openspec/AGENTS.md` explains how to write `spec.md`
      Then it SHALL instruct agents to include externally verifiable behavior, inputs/outputs, errors, and constraints
      And it SHALL instruct agents to avoid internal library/framework choices and class/function-level implementation details in specs

    Scenario: Routing detail to the right artifact
      When implementation detail is necessary
      Then instructions SHALL direct the agent to place it in `design.md` or `tasks.md`, not in the behavioral requirements section of `spec.md`

  @REQ-0157
  Rule: Lightweight-by-Default Guidance
    Agent instruction docs SHALL promote minimal ceremony and proportional rigor for spec authoring.

    Scenario: Applying progressive rigor
      When an agent drafts specs for routine changes
      Then instructions SHALL favor concise, lightweight requirements and scenarios
      And reserve deeper, fuller specification style for higher-risk changes (such as API breaks, migrations, cross-team, or security/privacy sensitive work)

    Scenario: Time-to-clarity optimization
      When guidance discusses drafting workflow
      Then it SHALL emphasize producing the smallest spec that is still testable and reviewable
