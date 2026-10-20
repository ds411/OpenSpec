Feature: alpha

  @added @REQ-0002
  Rule: Parser SHALL accept CRLF change proposals
    The parser SHALL accept CRLF change proposals without manual edits.

    Scenario: Validate CRLF change
      Given a change proposal saved with CRLF line endings
      When a developer runs openspec validate on the proposal
      Then validation succeeds without section errors
