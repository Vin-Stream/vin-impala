# Contributing to Impala

Thank you for your interest in contributing to Impala!

Impala is a sovereign media engine with a clean, intentional architecture. Contributions should respect the design principles that guide the project.

## Philosophy
- Keep the architecture clean.
- Avoid unnecessary abstraction or layering.
- Remove dead code before adding new features.
- Maintain clarity and predictability in all modules.

## How to Contribute
### 1. Fork the repository
Create your own fork and work from a feature branch.

### 2. Follow the project structure
Impala’s core components:
- `/engine` — playback and streaming logic
- `/workflow` — task and action orchestration
- `/library` — media indexing and metadata
- `/ui` — interface components (if applicable)

### 3. Write clear commits
Use descriptive commit messages that explain *why* a change was made.

### 4. Open a Pull Request
Include:
- A summary of the change
- Why it’s needed
- Any architectural considerations
- Tests, if applicable

### 5. Respect the PR template
It ensures consistency and protects the engine’s integrity.

## Questions?
Open an issue using the appropriate template.
