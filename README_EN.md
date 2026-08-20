<p align="center">
  <img src="apps/desktop/src/renderer/src/assets/logo.png" alt="SkillBuddy" width="96" />
</p>

<h1 align="center">SkillBuddy</h1>

<p align="center">
  A desktop workspace for managing, installing, and synchronizing Skills and MCP Servers across AI agents.
</p>

<p align="center">
  English · <a href="README.md">简体中文</a>
</p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-2563eb" />
  <img alt="Status" src="https://img.shields.io/badge/status-public%20preview-f59e0b" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Vue%203-47848f" />
</p>

SkillBuddy brings Skills and MCP configurations scattered across different AI coding tools into one interface. It can inspect local installations, distribute content across platforms, resolve drift, discover resources from public marketplaces, and manage reviewed team assets through Git repositories.

> `v0.1.0` is the first public preview. Features and local data formats may still change during the `0.x` series.

## Screenshots

![SkillBuddy dashboard](docs/images/dashboard.png)

<table>
  <tr>
    <td width="50%">
      <img src="docs/images/mcp-overview.png" alt="MCP Server management" />
      <p align="center">MCP Server management</p>
    </td>
    <td width="50%">
      <img src="docs/images/mcp-plan.png" alt="MCP change preview" />
      <p align="center">Preview configuration writes before applying them</p>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <img src="docs/images/team-mcp-plan.png" alt="Team library MCP installation plan" />
      <p align="center">Install a reviewed MCP Server from a Git team library</p>
    </td>
  </tr>
</table>

## Highlights

- **Unified inventory**: automatically discover and aggregate Skills and MCP Servers across agents.
- **Cross-platform installation**: install one Skill into multiple user-level or project-level targets.
- **Drift detection and synchronization**: compare conflicting copies and synchronize from a selected baseline.
- **Enable, disable, and uninstall**: manage writable Skills, with trash and undo support for removal.
- **Skill discovery**: search skills.sh, SkillHub, and GitHub, then inspect content and resources before installation.
- **MCP discovery and change plans**: find MCP Servers, validate target capabilities, and preview exact writes.
- **Presets and bundles**: save reusable Skill sets for batch installation, toggling, import, and export.
- **Private Git backup**: back up user-level Skills and Presets, then preview restore operations on another device.
- **Git team libraries**: manage reviewed Skills, MCP definitions, role bundles, and policies through protected branches and PRs/MRs.
- **Project compliance**: declare project requirements in `.skillbuddy/team.yaml` and detect missing, outdated, blocked, or unresolved resources.
- **Custom platforms**: add another agent by configuring its detection, user, and project paths.
- **Bilingual UI**: Simplified Chinese and English are built in.

## Supported Agents

SkillBuddy includes built-in Skill directory conventions for:

| Agent | User scope | Project scope |
| --- | :---: | :---: |
| Claude Code | ✓ | ✓ |
| Codex | ✓ | ✓ |
| Cursor | ✓ | ✓ |
| OpenCode | ✓ | ✓ |
| GitHub Copilot | ✓ | ✓ |
| Gemini CLI | ✓ | ✓ |
| CodeBuddy | ✓ | ✓ |
| Trae / Trae CN | ✓ | ✓ |
| WorkBuddy | ✓ | - |
| Doubao | ✓ | - |
| Kimi Code | ✓ | ✓ |
| Z Code | ✓ | ✓ |

MCP formats, scopes, and capabilities vary by platform. SkillBuddy displays the detected configuration surfaces and validates every planned change before applying it. Some conventions still need broader real-device feedback; see [Platform conventions](docs/platform-conventions.md).

## Download

The first preview is planned for **Apple Silicon Macs running macOS 11 or later**:

- [Open GitHub Releases](https://github.com/konnga/skill-buddy/releases)
- Basic Windows and Linux build configuration exists, but those platforms are not verified release targets for `v0.1.0`.

SkillBuddy reads the local directories already used by your agents. Installation, synchronization, toggling, and removal only affect targets explicitly selected in the interface.

## Team Workflow

A team can use Git as the source of truth for content, versions, permissions, and audit history:

- Maintainers edit Skills, MCP definitions, bundles, and policies on isolated `skillbuddy/<id>` branches.
- File lists, validation results, and diffs can be reviewed before publishing.
- GitHub contributions use `gh` to create Pull Requests; GitLab contributions use `glab` to create Merge Requests.
- Regular members browse and install only content that has already been merged.
- Private repository authentication stays with system Git, SSH Agent, or the credential manager. SkillBuddy does not store repository passwords.

See [Git team libraries](docs/team-library.md) for repository formats and the complete workflow.

## Security and Privacy

- SkillBuddy scans and manages local files by default and does not require a SkillBuddy account.
- An optional GitHub token can raise marketplace API limits and is stored through the system secure storage.
- MCP definitions must not contain plaintext tokens, passwords, or API keys. Use environment-variable or secret references.
- Git backup excludes MCP configuration, tokens, absolute machine paths, project-level Skills, and enablement state.
- Read-only system, administrator, and plugin Skills cannot be edited or removed.
- Main-process path validation prevents writes outside managed roots and rejects symlink escapes.

## Repository Layout

```text
skill-buddy/
├── apps/
│   ├── desktop/       # Electron + Vue 3 desktop app
│   └── registry/      # Optional self-hosted Fastify + SQLite registry
├── packages/
│   ├── core/          # Canonical models, scanning, aggregation, adapters, and validation
│   └── cli/           # skm command-line interface
└── docs/              # Design, platform, registry, and team-library documentation
```

The desktop team workflow uses Git team libraries and does not depend on the Registry. The Registry and CLI remain available for optional self-hosting and automation; see [Registry documentation](docs/registry.md).

## Development

Requirements:

- Node.js 22 or later
- pnpm 10 or later
- Git

```bash
pnpm install
pnpm dev
```

Common commands:

```bash
pnpm build       # Build every workspace package
pnpm test        # Run unit tests
pnpm test:e2e    # Build and run Electron end-to-end tests
pnpm typecheck   # Type-check the complete repository
```

## Contributing

Issues and Pull Requests are welcome. Before submitting a change, please try to:

1. Include the affected platform, scope, and reproduction steps.
2. Add coverage for shared logic when appropriate.
3. Run the type checks or tests relevant to the change.
4. Avoid committing real tokens, local paths, or private team content.

## License

The open-source license will be finalized before the `v0.1.0` release. MIT and Apache License 2.0 are the current candidates. Once selected, a root `LICENSE` file and matching workspace package metadata will be added.
