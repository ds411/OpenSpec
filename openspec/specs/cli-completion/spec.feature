Feature: cli-completion
  Provide shell completion scripts for the OpenSpec CLI, enabling tab-completion for commands, flags, and dynamic values (change IDs, spec IDs) across multiple shells. Supports Zsh, Bash, Fish, and PowerShell.

  @REQ-0050
  Rule: Native Shell Behavior Integration
    The completion system SHALL respect and integrate with each supported shell's native completion patterns and user interaction model.

    Scenario: Zsh native completion
      When generating Zsh completion scripts
      Then use Zsh completion system with `_arguments`, `_describe`, and `compadd`
      And completions SHALL trigger on single TAB (standard Zsh behavior)
      And display as an interactive menu that users navigate with TAB/arrow keys
      And support Oh My Zsh's enhanced menu styling automatically

    Scenario: Bash native completion
      When generating Bash completion scripts
      Then use Bash completion with `complete` builtin and `COMPREPLY` array
      And completions SHALL trigger on double TAB (standard Bash behavior)
      And display as space-separated list or column format
      And support both bash-completion v1 and v2 patterns

    Scenario: Fish native completion
      When generating Fish completion scripts
      Then use Fish's `complete` command with conditions
      And completions SHALL trigger on single TAB with auto-suggestion preview
      And display with Fish's native coloring and description alignment
      And leverage Fish's built-in caching automatically

    Scenario: PowerShell native completion
      When generating PowerShell completion scripts
      Then use `Register-ArgumentCompleter` with scriptblock
      And completions SHALL trigger on TAB with cycling behavior
      And display with PowerShell's native completion UI
      And support both Windows PowerShell 5.1 and PowerShell Core 7+

    Scenario: No custom UX patterns
      When implementing completion for any shell
      Then do NOT attempt to customize completion trigger behavior
      And do NOT override shell-specific navigation patterns
      And ensure completions feel native to experienced users of that shell

  @REQ-0051
  Rule: Command Structure
    The completion command SHALL follow a subcommand pattern for generating and managing completion scripts.

    Scenario: Available subcommands
      When user executes `openspec completion --help`
      Then display available subcommands:
        """
        - `generate [shell]` - Generate completion script for a shell (outputs to stdout)
        - `install [shell]` - Install completion for Zsh (auto-detects or requires explicit shell)
        - `uninstall [shell]` - Remove completion for Zsh (auto-detects or requires explicit shell)
        """

  @REQ-0052
  Rule: Shell Detection
    The completion system SHALL automatically detect the user's current shell environment.

    Scenario: Detecting Zsh from environment
      When no shell is explicitly specified
      Then read the `$SHELL` environment variable
      And extract the shell name from the path (e.g., `/bin/zsh` → `zsh`)
      And validate the shell is one of: `zsh`, `bash`, `fish`, `powershell`
      And throw an error if the shell is not supported

    Scenario: Detecting Bash from environment
      When `$SHELL` contains `bash` in the path
      Then detect shell as `bash`
      And proceed with bash-specific completion logic

    Scenario: Detecting Fish from environment
      When `$SHELL` contains `fish` in the path
      Then detect shell as `fish`
      And proceed with fish-specific completion logic

    Scenario: Detecting PowerShell from environment
      When `$PSModulePath` environment variable is present
      Then detect shell as `powershell`
      And proceed with PowerShell-specific completion logic

    Scenario: Unsupported shell detection
      When shell path indicates an unsupported shell
      Then throw error: "Shell '<name>' is not supported. Supported shells: zsh, bash, fish, powershell"

  @REQ-0053
  Rule: Completion Generation
    The completion command SHALL generate completion scripts for all supported shells on demand.

    Scenario: Generating Zsh completion
      When user executes `openspec completion generate zsh`
      Then output a complete Zsh completion script to stdout
      And include completions for all commands: init, list, show, validate, archive, view, update, change, spec, completion
      And include all command-specific flags and options
      And use Zsh's `_arguments` and `_describe` built-in functions
      And support dynamic completion for change and spec IDs

    Scenario: Generating Bash completion
      When user executes `openspec completion generate bash`
      Then output a complete Bash completion script to stdout
      And include completions for all commands and subcommands
      And use `complete -F` with custom completion function
      And populate `COMPREPLY` with appropriate suggestions
      And support dynamic completion for change and spec IDs via `openspec __complete`

    Scenario: Generating Fish completion
      When user executes `openspec completion generate fish`
      Then output a complete Fish completion script to stdout
      And use `complete -c openspec` with conditions
      And include command-specific completions with `--condition` predicates
      And support dynamic completion for change and spec IDs via `openspec __complete`
      And include descriptions for each completion option

    Scenario: Generating PowerShell completion
      When user executes `openspec completion generate powershell`
      Then output a complete PowerShell completion script to stdout
      And use `Register-ArgumentCompleter -CommandName openspec`
      And implement scriptblock that handles command context
      And support dynamic completion for change and spec IDs via `openspec __complete`
      And return `[System.Management.Automation.CompletionResult]` objects

  @REQ-0054
  Rule: Dynamic Completions
    The completion system SHALL provide context-aware dynamic completions for project-specific values.

    Scenario: Completing change IDs
      When completing arguments for commands that accept change names (show, validate, archive)
      Then discover active changes from `openspec/changes/` directory
      And exclude archived changes in `openspec/changes/archive/`
      And return change IDs as completion suggestions
      And only provide suggestions when inside an OpenSpec-enabled project

    Scenario: Completing spec IDs
      When completing arguments for commands that accept spec names (show, validate)
      Then discover specs from `openspec/specs/` directory
      And return spec IDs as completion suggestions
      And only provide suggestions when inside an OpenSpec-enabled project

    Scenario: Completion caching
      When dynamic completions are requested
      Then cache discovered change and spec IDs for 2 seconds
      And reuse cached values for subsequent requests within cache window
      And automatically refresh cache after expiration

    Scenario: Project detection
      When user requests completions outside an OpenSpec project
      Then skip dynamic change/spec ID completions
      And only suggest static commands and flags

  @REQ-0055
  Rule: Installation Automation
    The completion command SHALL automatically install completion scripts into shell configuration files for all supported shells.

    Scenario: Installing for Oh My Zsh
      When user executes `openspec completion install zsh`
      Then detect if Oh My Zsh is installed by checking for `$ZSH` environment variable or `~/.oh-my-zsh/` directory
      And create custom completions directory at `~/.oh-my-zsh/custom/completions/` if it doesn't exist
      And write completion script to `~/.oh-my-zsh/custom/completions/_openspec`
      And ensure `~/.oh-my-zsh/custom/completions` is in `$fpath` by updating `~/.zshrc` if needed
      And display success message with instruction to run `exec zsh` or restart terminal

    Scenario: Installing for standard Zsh
      When user executes `openspec completion install zsh` and Oh My Zsh is not detected
      Then create completions directory at `~/.zsh/completions/` if it doesn't exist
      And write completion script to `~/.zsh/completions/_openspec`
      And add `fpath=(~/.zsh/completions $fpath)` to `~/.zshrc` if not already present
      And add `autoload -Uz compinit && compinit` to `~/.zshrc` if not already present
      And display success message with instruction to run `exec zsh` or restart terminal

    Scenario: Installing for Bash with bash-completion
      When user executes `openspec completion install bash`
      Then detect if bash-completion is installed by checking for `/usr/share/bash-completion` or `/etc/bash_completion.d`
      And if bash-completion is available, write to `/etc/bash_completion.d/openspec` (with sudo) or `~/.local/share/bash-completion/completions/openspec`
      And if bash-completion is not available, write to `~/.bash_completion.d/openspec` and source it from `~/.bashrc`
      And add sourcing line to `~/.bashrc` using marker-based updates if needed
      And display success message with instruction to run `exec bash` or restart terminal

    Scenario: Installing for Fish
      When user executes `openspec completion install fish`
      Then create Fish completions directory at `~/.config/fish/completions/` if it doesn't exist
      And write completion script to `~/.config/fish/completions/openspec.fish`
      And Fish automatically loads completions from this directory (no config file modification needed)
      And display success message indicating completions are immediately available

    Scenario: Installing for PowerShell
      When user executes `openspec completion install powershell`
      Then detect PowerShell profile location via `$PROFILE` environment variable or default paths
      And create profile directory if it doesn't exist
      And add completion script import to profile using marker-based updates
      And write completion script to PowerShell modules directory or alongside profile
      And display success message with instruction to restart PowerShell or run `. $PROFILE`

    Scenario: Auto-detecting shell for installation
      When user executes `openspec completion install` without specifying a shell
      Then detect current shell using shell detection logic
      And install completion for the detected shell (zsh, bash, fish, or powershell)
      And display which shell was detected

    Scenario: Already installed
      When completion is already installed for the target shell
      Then display message indicating completion is already installed
      And offer to reinstall/update by overwriting existing files
      And exit with code 0

  @REQ-0056
  Rule: Uninstallation
    The completion command SHALL remove installed completion scripts and configuration for all supported shells.

    Scenario: Uninstalling Zsh completion
      When user executes `openspec completion uninstall zsh`
      Then prompt for confirmation before proceeding (unless `--yes` flag provided)
      And if user declines, cancel uninstall and display "Uninstall cancelled."
      And if user confirms, remove `~/.oh-my-zsh/custom/completions/_openspec` if Oh My Zsh is detected
      And remove `~/.zsh/completions/_openspec` if standard Zsh setup is detected
      And remove fpath modifications from `~/.zshrc` using marker-based removal
      And display success message

    Scenario: Uninstalling Bash completion
      When user executes `openspec completion uninstall bash`
      Then prompt for confirmation (unless `--yes` flag provided)
      And if user confirms, remove completion file from bash-completion directory or `~/.bash_completion.d/`
      And remove sourcing lines from `~/.bashrc` using marker-based removal
      And display success message

    Scenario: Uninstalling Fish completion
      When user executes `openspec completion uninstall fish`
      Then prompt for confirmation (unless `--yes` flag provided)
      And if user confirms, remove `~/.config/fish/completions/openspec.fish`
      And display success message (no config file modification needed)

    Scenario: Uninstalling PowerShell completion
      When user executes `openspec completion uninstall powershell`
      Then prompt for confirmation (unless `--yes` flag provided)
      And if user confirms, remove completion import from PowerShell profile using marker-based removal
      And remove completion script file
      And display success message

    Scenario: Auto-detecting shell for uninstallation
      When user executes `openspec completion uninstall` without specifying a shell
      Then detect current shell and uninstall completion for that shell

    Scenario: Not installed
      When attempting to uninstall completion that isn't installed
      Then display error message indicating completion is not installed
      And exit with code 1

  @REQ-0057
  Rule: Architecture Patterns
    The completion implementation SHALL follow clean architecture principles with TypeScript best practices, supporting multiple shells through a plugin-based pattern.

    Scenario: Shell-specific generators
      When implementing completion generators
      Then create generator classes for each shell: `ZshGenerator`, `BashGenerator`, `FishGenerator`, `PowerShellGenerator`
      And implement a common `CompletionGenerator` interface with method:
        """
        - `generate(commands: CommandDefinition[]): string` - Returns complete shell script
        """
      And each generator handles shell-specific syntax, escaping, and patterns
      And all generators consume the same `CommandDefinition[]` from the command registry

    Scenario: Shell-specific installers
      When implementing completion installers
      Then create installer classes for each shell: `ZshInstaller`, `BashInstaller`, `FishInstaller`, `PowerShellInstaller`
      And implement a common `CompletionInstaller` interface with methods:
        """
        - `install(script: string): Promise<InstallationResult>` - Installs completion script
        - `uninstall(): Promise<{ success: boolean; message: string }>` - Removes completion
        """
      And each installer handles shell-specific paths, config files, and installation patterns

    Scenario: Factory pattern for shell selection
      When selecting shell-specific implementation
      Then use `CompletionFactory` class with static methods:
        """
        - `createGenerator(shell: SupportedShell): CompletionGenerator`
        - `createInstaller(shell: SupportedShell): CompletionInstaller`
        """
      And factory uses switch statements with TypeScript exhaustiveness checking
      And adding new shell requires updating `SupportedShell` type and factory cases

    Scenario: Dynamic completion providers
      When implementing dynamic completions
      Then create a `CompletionProvider` class that encapsulates project discovery logic
      And implement methods:
        """
        - `getChangeIds(): Promise<string[]>` - Discovers active change IDs
        - `getSpecIds(): Promise<string[]>` - Discovers spec IDs
        - `isOpenSpecProject(): boolean` - Checks if current directory is OpenSpec-enabled
        """
      And implement caching with 2-second TTL using class properties

    Scenario: Command registry
      When defining completable commands
      Then create a centralized `CommandDefinition` type with properties:
        """
        - `name: string` - Command name
        - `description: string` - Help text
        - `flags: FlagDefinition[]` - Available flags
        - `acceptsPositional: boolean` - Whether command takes positional arguments
        - `positionalType: string` - Type of positional (change-id, spec-id, path, shell)
        - `subcommands?: CommandDefinition[]` - Nested subcommands
        """
      And export a `COMMAND_REGISTRY` constant with all command definitions
      And all generators consume this registry to ensure consistency across shells

    Scenario: Type-safe shell detection
      When implementing shell detection
      Then define a `SupportedShell` type as literal type: `'zsh' | 'bash' | 'fish' | 'powershell'`
      And implement `detectShell()` function in `src/utils/shell-detection.ts`
      And return detected shell or throw error with supported shells list

  @REQ-0058
  Rule: Error Handling
    The completion command SHALL provide clear error messages for common failure scenarios.

    Scenario: Unsupported shell
      When user requests completion for unsupported shell (e.g., ksh, csh, tcsh)
      Then display error message: "Shell '<name>' is not supported yet. Currently supported: zsh, bash, fish, powershell"
      And exit with code 1

    Scenario: Permission errors during installation
      When installation fails due to file permission issues
      Then display clear error message indicating permission problem
      And suggest using appropriate permissions or alternative installation method
      And exit with code 1

    Scenario: Missing shell configuration directory
      When expected shell configuration directory doesn't exist
      Then create the directory automatically (with user notification)
      And proceed with installation

    Scenario: Shell not detected
      When `openspec completion install` cannot detect current shell
      Then display error: "Could not auto-detect shell. Please specify shell explicitly."
      And display usage hint: "Usage: openspec completion <operation> [shell]"
      And exit with code 1

  @REQ-0059
  Rule: Output Format
    The completion command SHALL provide machine-parseable and human-readable output.

    Scenario: Script generation output
      When generating completion script to stdout
      Then output only the completion script content (no extra messages)
      And allow redirection to files: `openspec completion generate zsh > /path/to/_openspec`

    Scenario: Installation success output
      When installation completes successfully
      Then display formatted success message with:
        """
        - Checkmark indicator
        - Installation location
        - Next steps (shell reload instructions)
        """
      And use colors when terminal supports it (unless `--no-color` is set)

    Scenario: Verbose installation output
      When user provides `--verbose` flag during installation
      Then display detailed steps:
        """
        - Shell detection result
        - Target file paths
        - Configuration modifications
        - File creation confirmations
        """

  @REQ-0060
  Rule: Testing Support
    The completion implementation SHALL be testable with unit and integration tests for all supported shells.

    Scenario: Mock shell environment
      When writing tests for shell detection
      Then allow overriding `$SHELL` and `$PSModulePath` environment variables
      And use dependency injection for file system operations
      And test detection for all four shells independently

    Scenario: Generator output verification
      When testing completion generators
      Then create test suite for each shell generator (zsh, bash, fish, powershell)
      And verify generated scripts contain expected patterns for that shell
      And test that command registry is properly consumed
      And ensure dynamic completion placeholders are present
      And verify shell-specific syntax and escaping

    Scenario: Installer simulation
      When testing installation logic
      Then create test suite for each shell installer
      And use temporary test directories instead of actual home directories
      And verify file creation without modifying real shell configurations
      And test path resolution logic independently
      And mock file system operations to avoid side effects

    Scenario: Cross-shell consistency
      When testing completion behavior
      Then verify all shells support the same commands and flags
      And verify dynamic completions work consistently across shells
      And ensure error messages are consistent across shells
