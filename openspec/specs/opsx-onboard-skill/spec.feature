Feature: opsx-onboard-skill
  Define `/opsx:onboard` behavior for guiding users through an end-to-end OpenSpec workflow on their real codebase.

  @REQ-0192
  Rule: OPSX Onboard Skill
    The system SHALL provide an `/opsx:onboard` skill that guides users through their first complete OpenSpec workflow cycle with narration and real codebase work.

    Scenario: Skill invocation
      When user invokes `/opsx:onboard`
      Then agent checks if OpenSpec is initialized
      And if not initialized, prompts user to run `openspec init` first
      And if initialized, proceeds with onboarding flow

    Scenario: Welcome and expectations
      When onboarding begins
      Then agent displays welcome message explaining what will happen
      And sets expectation of ~15 minute duration
      And explains the workflow phases: explore → new → artifacts → apply → archive

  @REQ-0193
  Rule: Codebase Analysis for Task Suggestions
    The skill SHALL analyze the user's codebase to suggest appropriately-scoped starter tasks.

    Scenario: Codebase scanning
      When onboarding reaches task selection phase
      Then agent scans codebase for small improvement opportunities
      And looks for: TODO/FIXME comments, missing error handling, functions without tests, outdated dependencies, type: any in TypeScript, console.log in production code, missing input validation
      And checks recent git commits for context on current work

    Scenario: Task suggestion presentation
      When agent has analyzed codebase
      Then agent presents 3-4 specific task suggestions with scope estimates
      And each suggestion includes: task description, estimated scope (files/lines), why it's a good starter
      And offers option for user to specify their own task

    Scenario: Scope guardrail
      When user selects or describes a task that is too large
      Then agent gently redirects toward smaller scope
      And suggests breaking down or deferring the large task
      And offers appropriately-sized alternatives

  @REQ-0194
  Rule: Explore Phase Demo
    The skill SHALL briefly demonstrate explore mode before creating a change.

    Scenario: Brief explore demonstration
      When task is selected
      Then agent briefly demonstrates `/opsx:explore` by investigating relevant code
      And explains explore mode is for thinking before doing
      And keeps this phase short (not a full exploration session)
      And transitions to change creation

  @REQ-0195
  Rule: Guided Artifact Creation
    The skill SHALL guide users through each artifact with narration explaining the purpose.

    Scenario: Change creation with narration
      When creating the change directory
      Then agent runs `openspec new change "<name>"` with derived kebab-case name
      And explains what a "change" is (container for thinking and planning)
      And shows the folder structure that was created
      And pauses for user acknowledgment before proceeding

    Scenario: Proposal creation with narration
      When creating proposal.md
      Then agent explains proposals capture WHY we're making this change
      And drafts proposal based on selected task
      And shows draft to user for approval before saving
      And explains the sections (Why, What Changes, Capabilities, Impact)

    Scenario: Specs creation with narration
      When creating spec files
      Then agent explains specs define WHAT we're building in detail
      And explains the requirement/scenario format
      And creates spec file(s) based on proposal capabilities
      And notes that specs become documentation that stays in sync

    Scenario: Design creation with narration
      When creating design.md
      Then agent explains design captures HOW we'll build it
      And notes this is where technical decisions and tradeoffs live
      And for small changes, acknowledges design may be brief
      And creates design based on proposal and specs

    Scenario: Tasks creation with narration
      When creating tasks.md
      Then agent explains tasks break work into checkboxes
      And explains these drive the apply phase
      And generates task list from design and specs
      And shows tasks and asks if ready to implement

  @REQ-0196
  Rule: Guided Implementation
    The skill SHALL implement tasks with narration connecting back to artifacts.

    Scenario: Implementation with narration
      When implementing tasks
      Then agent announces each task before working on it
      And implements the change in the codebase
      And occasionally references how specs/design informed decisions
      And marks each task complete as it finishes
      And keeps narration light (not over-explaining)

    Scenario: Implementation completion
      When all tasks are complete
      Then agent announces completion
      And summarizes what was done
      And transitions to archive phase

  @REQ-0197
  Rule: Archive with Explanation
    The skill SHALL archive the completed change and explain what happened.

    Scenario: Archive with narration
      When archiving the change
      Then agent explains archive moves change to dated folder
      And runs archive process
      And shows where archived change lives
      And explains the long-term value (finding decisions later)

  @REQ-0198
  Rule: Recap and Next Steps
    The skill SHALL conclude with a recap and command reference.

    Scenario: Final recap
      When onboarding is complete
      Then agent summarizes the workflow phases completed
      And emphasizes this rhythm works for any size change
      And provides command reference table (/opsx:explore, /opsx:new, /opsx:ff, /opsx:continue, /opsx:apply, /opsx:verify, /opsx:archive)
      And suggests next actions (try /opsx:new or /opsx:ff on something)

  @REQ-0199
  Rule: Graceful Exit Handling
    The skill SHALL handle users who want to stop mid-way.

    Scenario: User wants to stop
      When user indicates they want to stop during onboarding
      Then agent acknowledges gracefully
      And notes that the in-progress change is saved
      And explains how to continue later with `/opsx:continue <name>`
      And exits without pressure

    Scenario: User wants quick reference only
      When user says they just want to see the commands
      Then agent provides command cheat sheet
      And exits gracefully with encouragement to try `/opsx:new`
