Feature: ci-nix-validation
  Validates Nix flake builds and maintenance scripts in CI to ensure Nix users can reliably install and use OpenSpec. Prevents regressions in Nix support by testing builds and the update-flake.sh script on every pull request and push to main.

  @REQ-0014
  Rule: Nix Flake Build Validation
    The CI system SHALL validate that the Nix flake builds successfully on every pull request and push to main.

    Scenario: Successful flake build
      When a pull request or push to main is made
      Then the CI SHALL execute `nix build` and verify it completes with exit code 0
      And the build output SHALL contain the openspec binary

    Scenario: Flake build failure
      When the Nix flake configuration is broken
      Then the CI job SHALL fail with a non-zero exit code
      And the CI SHALL prevent merging of the pull request

    Scenario: Multi-platform support check
      When the flake declares support for multiple systems
      Then the CI SHALL validate the flake builds on at least Linux (x86_64-linux)

  @REQ-0015
  Rule: Update Script Validation
    The CI system SHALL validate that the update-flake.sh script executes successfully and produces valid output.

    Scenario: Update script execution
      When the CI runs the update script validation
      Then the script SHALL execute without errors
      And the script SHALL correctly read the version from package.json
      And the script SHALL validate that flake.nix uses dynamic version from package.json

    Scenario: Update script with mock hash
      When validating the update script in CI
      Then the script SHALL be able to detect and extract the correct pnpm dependency hash
      And the flake.nix SHALL be updated with a valid sha256 hash

  @REQ-0016
  Rule: CI Job Integration
    The Nix validation jobs SHALL be integrated into the existing GitHub Actions workflow and required for merge.

    Scenario: PR merge requirements
      When a pull request is created
      Then the Nix validation job SHALL be included in required checks
      And the PR SHALL NOT be mergeable until Nix validation passes

    Scenario: Job execution triggers
      When code is pushed to a pull request OR pushed to main OR manually triggered
      Then the Nix validation job SHALL execute automatically

  @REQ-0017
  Rule: Local Testing Support
    The CI workflow SHALL be testable locally using the `act` tool to enable rapid iteration.

    Scenario: Local CI execution with act
      When a developer runs `act` with the Nix validation workflow
      Then the workflow SHALL execute in the local Docker environment
      And the developer SHALL receive feedback on Nix build status without pushing to GitHub

    Scenario: Act configuration compatibility
      When the workflow is designed
      Then it SHALL use standard GitHub Actions syntax compatible with `act`
      And any Nix-specific setup SHALL work in the act Docker environment

  @REQ-0018
  Rule: Nix Installation in CI
    The CI environment SHALL have Nix properly installed and configured before running validation.

    Scenario: Nix installation step
      When the Nix validation job starts
      Then Nix SHALL be installed using the official Nix installer or determinatesystems/nix-installer-action
      And the Nix installation SHALL be cached for subsequent runs to improve performance

    Scenario: Nix configuration for CI
      When Nix is installed in CI
      Then it SHALL be configured to work in the GitHub Actions environment
      And experimental features (flakes, nix-command) SHALL be enabled

  @REQ-0019
  Rule: CI Performance Optimization
    The Nix validation SHALL be optimized to minimize CI runtime impact.

    Scenario: Acceptable runtime
      When the Nix validation job runs
      Then it SHALL complete in under 5 minutes on a clean run
      And with caching, it SHALL complete in under 3 minutes on subsequent runs

    Scenario: Parallel execution
      When multiple CI jobs are running
      Then the Nix validation job SHALL run in parallel with other validation jobs (tests, lint)
      And SHALL NOT block other independent checks
