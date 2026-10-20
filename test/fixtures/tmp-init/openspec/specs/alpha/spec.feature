Feature: alpha
  This spec ensures the validation harness exercises a deterministic alpha module for automated tests.

  @REQ-0001
  Rule: Alpha module SHALL produce deterministic output
    The alpha module SHALL produce a deterministic response for validation.

    Scenario: Deterministic alpha run
      Given a configured alpha module
      When the module runs the default flow
      Then the output matches the expected fixture result
