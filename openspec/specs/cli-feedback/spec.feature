Feature: cli-feedback
  Define `openspec feedback` behavior for creating GitHub issues safely via `gh`, with a manual fallback when automation is unavailable.

  @REQ-0073
  Rule: Feedback command
    The system SHALL provide an `openspec feedback` command that creates a GitHub Issue in the openspec repository using the `gh` CLI. The system SHALL use `execFileSync` with argument arrays to prevent shell injection vulnerabilities.

    Scenario: Simple feedback submission
      When user executes `openspec feedback "Great tool!"`
      Then the system executes `gh issue create` with title "Feedback: Great tool!"
      And the issue body includes "Great tool!" under a Summary heading
      And the issue is created in the openspec repository
      And the issue has the `feedback` label
      And the system displays the created issue URL

    Scenario: Repository does not define the feedback label
      When user executes `openspec feedback "Great tool!"`
      And the repository does not define the `feedback` label, so `gh` refuses to create the issue
      Then the system retries `gh issue create` without the label
      And the issue is created in the openspec repository without the `feedback` label
      And the system displays the created issue URL
      And the system notes that the label was not applied

    Scenario: Safe command execution
      When submitting feedback via `gh` CLI
      Then the system uses `execFileSync` with separate arguments array
      And user input is NOT passed through a shell
      And shell metacharacters (quotes, backticks, $(), etc.) are treated as literal text

    Scenario: Feedback with body
      When user executes `openspec feedback "Title here" --body "Detailed description..."`
      Then the system creates a GitHub Issue with the specified title
      And the issue body contains the message under a Summary heading
      And the issue body contains the detailed description under a Details heading
      And the issue body includes metadata (OpenSpec version, platform, timestamp)

    Scenario: Long or multiline feedback message
      When user executes `openspec feedback` with a long or multiline message
      Then the issue title is a single whitespace-normalized line of at most 72 characters
      And an ellipsis indicates when the title was shortened
      And the complete message is preserved in the issue body

  @REQ-0074
  Rule: GitHub CLI dependency
    The system SHALL use `gh` CLI for automatic feedback submission when available, and provide a manual submission fallback when `gh` is not installed or not authenticated. The system SHALL use platform-appropriate commands to detect `gh` CLI availability.

    Scenario: Missing gh CLI with fallback
      When user runs `openspec feedback "message"`
      And `gh` CLI is not installed (not found in PATH)
      Then the system displays warning: "GitHub CLI not found. Manual submission required."
      And outputs structured feedback content with delimiters:
        """
        - "--- FORMATTED FEEDBACK ---"
        - Title line
        - Labels line
        - Body content with metadata
        - "--- END FEEDBACK ---"
        """
      And displays pre-filled GitHub issue URL for manual submission
      And exits with zero code (successful fallback)

    Scenario: Cross-platform gh CLI detection on Unix
      When system is running on macOS or Linux (platform is 'darwin' or 'linux')
      And checking if `gh` CLI is installed
      Then the system executes `which gh` command

    Scenario: Cross-platform gh CLI detection on Windows
      When system is running on Windows (platform is 'win32')
      And checking if `gh` CLI is installed
      Then the system executes `where gh` command

    Scenario: Unauthenticated gh CLI with fallback
      When user runs `openspec feedback "message"`
      And `gh` CLI is installed but not authenticated
      Then the system displays warning: "GitHub authentication required. Manual submission required."
      And outputs structured feedback content (same format as missing gh CLI scenario)
      And displays pre-filled GitHub issue URL for manual submission
      And displays authentication instructions: "To auto-submit in the future: gh auth login"
      And exits with zero code (successful fallback)

    Scenario: Authenticated gh CLI
      When user runs `openspec feedback "message"`
      And `gh auth status` returns success (authenticated)
      Then the system proceeds with feedback submission

  @REQ-0075
  Rule: Issue metadata
    The system SHALL include relevant metadata in the GitHub Issue body.

    Scenario: Standard metadata
      When creating a GitHub Issue for feedback
      Then the issue body includes:
        """
        - OpenSpec CLI version
        - Platform (darwin, linux, win32)
        - Submission timestamp
        - Separator line: "---\nSubmitted via OpenSpec CLI"
        """

    Scenario: Windows platform metadata
      When creating a GitHub Issue for feedback on Windows
      Then the issue body includes "Platform: win32"
      And all platform detection uses Node.js `os.platform()` API

    Scenario: No sensitive metadata
      When creating a GitHub Issue for feedback
      Then the issue body does NOT include:
        """
        - File paths from user's system
        - Project names or directory names
        - Environment variables
        - IP addresses
        """

  @REQ-0076
  Rule: Feedback always works
    The system SHALL allow feedback submission regardless of telemetry settings.

    Scenario: Feedback with telemetry disabled
      When user has disabled telemetry via `OPENSPEC_TELEMETRY=0`
      And user runs `openspec feedback "message"`
      Then the feedback is still submitted via `gh` CLI
      And telemetry events are not sent

    Scenario: Feedback in CI environment
      When `CI=true` is set in the environment
      And user runs `openspec feedback "message"`
      Then the feedback submission proceeds normally (if `gh` is available and authenticated)

  @REQ-0077
  Rule: Error handling
    The system SHALL handle feedback submission errors gracefully.

    Scenario: gh CLI execution failure
      When `gh issue create` command fails for any reason other than the repository not defining the `feedback` label
      Then the system displays the error output from `gh` CLI
      And exits with the same exit code as `gh`
      And does not retry the submission

    Scenario: Network failure
      When `gh` CLI reports network connectivity issues
      Then the system displays the error message from `gh`
      And suggests checking network connectivity
      And exits with non-zero code

  @REQ-0078
  Rule: Feedback skill for agents
    The system SHALL provide a `/feedback` skill that guides agents through collecting and submitting user feedback.

    Scenario: Agent-initiated feedback
      When user invokes `/feedback` in an agent conversation
      Then the agent gathers context from the conversation
      And drafts a feedback issue with enriched content
      And anonymizes sensitive information
      And presents the draft to the user for approval
      And submits via `openspec feedback` command on user confirmation

    Scenario: Context enrichment
      When agent drafts feedback
      Then the agent includes relevant context such as:
        """
        - What task was being performed
        - What worked well or poorly
        - Specific friction points or praise
        """

    Scenario: Anonymization
      When agent drafts feedback
      Then the agent removes or replaces:
        """
        - File paths with `<path>` or generic descriptions
        - API keys, tokens, secrets with `<redacted>`
        - Company/organization names with `<company>`
        - Personal names with `<user>`
        - Specific URLs with `<url>` unless public/relevant
        """

    Scenario: User confirmation required
      When agent has drafted feedback
      Then the agent MUST show the complete draft to the user
      And ask for explicit approval before submitting
      And allow the user to request modifications
      And only submit after user confirms

  @REQ-0079
  Rule: Shell completions
    The system SHALL provide shell completions for the feedback command.

    Scenario: Command completion
      When user types `openspec fee<TAB>`
      Then the shell completes to `openspec feedback`

    Scenario: Flag completion
      When user types `openspec feedback "msg" --<TAB>`
      Then the shell suggests available flags (`--body`)
