Feature: config-loading
  Define how `openspec/config.yaml` is discovered, parsed, validated, and exposed to callers with safe fallbacks.

  @REQ-0143
  Rule: Load project config from openspec/config.yaml
    The system SHALL read and parse the project configuration file located at `openspec/config.yaml` relative to the project root.

    Scenario: Valid config file exists
      When `openspec/config.yaml` exists with valid YAML content
      Then system parses the file and returns a ProjectConfig object

    Scenario: Config file does not exist
      When `openspec/config.yaml` does not exist
      Then system returns null without error

    Scenario: Config file has invalid YAML syntax
      When `openspec/config.yaml` contains malformed YAML
      Then system logs a warning message and returns null

    Scenario: Config file has valid YAML but invalid schema
      When `openspec/config.yaml` contains valid YAML that fails Zod schema validation
      Then system logs a warning message with validation details and returns null

  @REQ-0144
  Rule: Support .yml file extension alias
    The system SHALL accept both `.yaml` and `.yml` file extensions for the config file.

    Scenario: Config file uses .yml extension
      When `openspec/config.yml` exists and `openspec/config.yaml` does not exist
      Then system reads from `openspec/config.yml`

    Scenario: Both .yaml and .yml exist
      When both `openspec/config.yaml` and `openspec/config.yml` exist
      Then system prefers `openspec/config.yaml`

  @REQ-0145
  Rule: Use resilient field-by-field parsing
    The system SHALL parse each config field independently, collecting valid fields and warning about invalid ones without rejecting the entire config.

    Scenario: Schema field is valid
      When config contains `schema: "spec-driven"`
      Then schema field is included in returned config

    Scenario: Schema field is missing
      When config lacks the `schema` field
      Then no warning is logged (field is optional at parse level)

    Scenario: Schema field is empty string
      When config contains `schema: ""`
      Then warning is logged and schema field is not included in returned config

    Scenario: Schema field is invalid type
      When config contains `schema: 123` (number instead of string)
      Then warning is logged and schema field is not included in returned config

    Scenario: Context field is valid
      When config contains `context: "Tech stack: TypeScript"`
      Then context field is included in returned config

    Scenario: Context field is invalid type
      When config contains `context: 123` (number instead of string)
      Then warning is logged and context field is not included in returned config

    Scenario: Rules field has valid structure
      When config contains `rules: { proposal: ["Rule 1"], specs: ["Rule 2"] }`
      Then rules field is included in returned config with valid rules

    Scenario: Rules field has non-array value for artifact
      When config contains `rules: { proposal: "not an array", specs: ["Valid"] }`
      Then warning is logged for proposal, but specs rules are still included in returned config

    Scenario: Rules array contains non-string elements
      When config contains `rules: { proposal: ["Valid rule", 123, ""] }`
      Then only "Valid rule" is included, warning logged about invalid elements

    Scenario: Mix of valid and invalid fields
      When config contains valid schema, invalid context type, valid rules
      Then config is returned with schema and rules fields, warning logged about context

  @REQ-0146
  Rule: Enforce context size limit
    The system SHALL reject context fields exceeding 50KB and log a warning.

    Scenario: Context within size limit
      When config contains context of 1KB
      Then context is included in returned config

    Scenario: Context at size limit
      When config contains context of exactly 50KB
      Then context is included in returned config

    Scenario: Context exceeds size limit
      When config contains context of 51KB
      Then warning is logged with size and limit, context field is not included in returned config

  @REQ-0147
  Rule: Defer artifact ID validation to instruction loading
    The system SHALL NOT validate artifact IDs in rules during config load time. Validation happens during instruction loading when schema is known.

    Scenario: Config with rules is loaded
      When config contains `rules: { unknownartifact: [...] }`
      Then config is loaded successfully without validation errors

    Scenario: Validation happens at instruction load time
      When instructions are loaded for any artifact and config has unknown artifact IDs in rules
      Then warnings are emitted about unknown artifact IDs (see rules-injection spec for details)

  @REQ-0148
  Rule: Gracefully handle config errors without halting
    The system SHALL continue operation with default values when config loading or parsing fails.

    Scenario: Config parse failure during command execution
      When config file has syntax errors and user runs `openspec new change`
      Then command executes using default schema "spec-driven"

    Scenario: Warning is visible to user
      When config loading fails
      Then system outputs warning message to stderr with details about the failure
