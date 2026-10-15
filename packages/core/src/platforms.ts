import type { AgentId } from './types.js'

/** Operating systems a platform may declare OS-specific paths for. */
export type PlatformOs = 'darwin' | 'win32' | 'linux'

/**
 * Declarative definition of an agent platform's skills locations.
 * Paths starting with `~/` are resolved against the home directory;
 * `projectSkillsDir` is relative to a project root. This is the single
 * place a platform's writable installation convention lives. Read-only
 * system and plugin roots are resolved separately by the scanner. Built-in
 * platforms are rows in BUILTIN_PLATFORMS; user-defined ("custom") platforms
 * use the same shape at runtime. Sources and confidence levels are documented
 * in docs/platform-conventions.md.
 */

export interface PlatformDef {
  id: AgentId
  displayName: string
  /** User-scope skills directory, `~/`-prefixed. null = no user scope. */
  userSkillsDir: string | null
  /**
   * Per-OS override for `userSkillsDir`, used by platforms that store skills
   * under an OS-specific application data directory (typically Electron apps
   * writing to `app.getPath('userData')`). The entry for the running OS wins;
   * `userSkillsDir` stays the fallback for any OS left unlisted.
   */
  userSkillsDirByOs?: Partial<Record<PlatformOs, string>>
  /** Project-scope skills directory relative to project root. null = no project scope. */
  projectSkillsDir: string | null
  /** Presence of this `~/`-prefixed path marks the platform as installed. */
  detectPath: string
  /** Per-OS override for `detectPath`, resolved like `userSkillsDirByOs`. */
  detectPathByOs?: Partial<Record<PlatformOs, string>>
  /**
   * 应用本体（安装包）的路径候选，绝对路径或 `~/` 前缀，命中任一即视为本体还在。
   *
   * 只按 OS 声明、没有 OS 无关的兜底项：安装包路径天生是 OS 专属的，留一个
   * 「通用」默认值只会在其它系统上误判。某个 OS 没有声明就表示该平台在这个
   * 系统上**不参与**残留判定 —— 这与「声明了但不存在」是两回事，前者不会
   * 产生任何提示。
   *
   * 未声明的平台（CLI 类平台没有可查的包体）同样永不参与判定。
   */
  installPathsByOs?: Partial<Record<PlatformOs, readonly string[]>>
  /** 经核实的 macOS Bundle ID，用于查询非默认位置及改名后的应用。 */
  macBundleId?: string
  /**
   * `detectPath` 之外、同样归该平台所有、可随残留一起清理的目录。
   *
   * 仅供「清理残留」列出候选，不参与已安装判定。声明时必须避开其它平台的
   * `detectPath`：例如 Antigravity 只能声明 `~/.gemini/antigravity*` 这些
   * 自己名下的子目录，绝不能声明 `~/.gemini` —— 那是 Gemini CLI 的根目录。
   */
  residualPathsByOs?: Partial<Record<PlatformOs, readonly string[]>>
}

/** Pick the path declared for `os`, falling back to the OS-neutral default. */
export function resolvePlatformOsPath<T extends string | null>(
  fallback: T,
  byOs: Partial<Record<PlatformOs, string>> | undefined,
  os: NodeJS.Platform,
): T | string {
  if (!byOs) return fallback
  return byOs[os as PlatformOs] ?? fallback
}

/**
 * Pick the list declared for `os`. An OS absent from the map yields an empty
 * list, which callers read as "not declared for this system" rather than
 * "declared and empty" — see `installPathsByOs`.
 */
export function resolvePlatformOsList(
  byOs: Partial<Record<PlatformOs, readonly string[]>> | undefined,
  os: NodeJS.Platform,
): string[] {
  return [...(byOs?.[os as PlatformOs] ?? [])]
}

/**
 * 内置平台表。
 *
 * 关于 `installPathsByOs`：只有**能查到安装包**的 GUI 应用才声明它，目前覆盖
 * Cursor、Trae、豆包、WPS 灵犀、DeepSeek Harness、Google Antigravity 的 macOS
 * 落点。以下平台刻意不声明，因此永不产生「应用已删除」提示：
 *
 * - CLI 类：claude-code、codex、gemini-cli、kimi、qwen-code、opencode、pi、omp、
 *   copilot（VS Code 扩展与 CLI）。它们没有可查的 GUI 包体（包管理器装的命令行
 *   程序没有稳定落点）。
 * - zcode：`~/.zcode` 同时被 GUI 与 `~/.zcode/cli` 的 agent 使用（日志至今仍在写），
 *   拿「GUI 包体不存在」推断整个目录是残留会产生误报。
 * - workbuddy：`~/.workbuddy` 是宿主运行时自己的数据目录（含 skills 与运行时二进制），
 *   把它做成可删目标的风险远大于收益。
 * - trae-cn / codebuddy / 豆包之外的平台：本机没有安装痕迹，无法核实包名，不猜。
 */
export const BUILTIN_PLATFORMS: readonly PlatformDef[] = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    userSkillsDir: '~/.claude/skills',
    projectSkillsDir: '.claude/skills',
    detectPath: '~/.claude',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    // Official convention is the cross-tool shared dir (.agents/skills),
    // not the ~/.codex/skills path from early community tutorials.
    userSkillsDir: '~/.agents/skills',
    projectSkillsDir: '.agents/skills',
    detectPath: '~/.codex',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    userSkillsDir: '~/.cursor/skills',
    projectSkillsDir: '.cursor/skills',
    detectPath: '~/.cursor',
    // 证据：Cursor 自己的 `~/Library/Application Support/Cursor` 日志里出现
    // `/Applications/Cursor.app`；bundle id 为 `com.todesktop.230313mzl4w4u92`。
    installPathsByOs: {
      darwin: ['/Applications/Cursor.app', '~/Applications/Cursor.app'],
    },
    macBundleId: 'com.todesktop.230313mzl4w4u92',
  },
  {
    /**
     * 真机核实（本机装有 `@deepseek-ai/dsh` 与 `/Applications/DeepSeek Harness.app`；
     * 以 harness 自带的 `@deepseek-ai/dsh-skill-filesystem` README 与扫描实现为准）。
     *
     * `dsh` 是 profile 启动器（`dsh --profile web|desktop|tui|headless`），各接入面
     * 共用同一个 `$DSH_HOME`：技能、指令、会话都在那里。所以 web 端与桌面端是**同一个
     * 平台的两个界面**，不是两个平台 —— 桌面端的 Electron userData 里没有技能目录，
     * 只有 Cache/Cookies 这类运行时数据。
     *
     * 用户根是 `<dshHome>/skills`，`dshHome` 取 `$DSH_HOME`、默认 `~/.dsh`；项目根是
     * `<repo-root>/.dsh/skills`。用户根会跳过 `.system` 子目录 —— 那是 harness 自己
     * 所有的 skill，由适配器的 supplementalRoots 只读登记。
     * `$DSH_BUNDLED_SKILL_DIR` 只有环境变量、没有默认落点，故不在此声明。
     *
     * 位置：技能侧的列表（侧边栏、安装目标、设置页平台区）直接按本数组顺序展示，
     * 不做额外排序 —— 表头那一段（Claude Code → Codex → Cursor）是字母序，DeepSeek
     * Harness 属于同一段拉丁字母序列，故排在 Cursor 之后。新增平台时先看清自己该落在
     * 哪一段，别顺手追加到表尾。
     */
    id: 'deepseek-harness',
    displayName: 'DeepSeek Harness',
    userSkillsDir: '~/.dsh/skills',
    projectSkillsDir: '.dsh/skills',
    detectPath: '~/.dsh',
    // 证据：`/Applications/DeepSeek Harness.app/Contents/Info.plist`
    // （CFBundleName `DeepSeek Harness`、CFBundleIdentifier `com.deepseek.dsh`、0.2.0-rc.2）。
    installPathsByOs: {
      darwin: ['/Applications/DeepSeek Harness.app', '~/Applications/DeepSeek Harness.app'],
    },
    macBundleId: 'com.deepseek.dsh',
    /**
     * 桌面端的 Electron userData：只放缓存与本地状态，技能/指令不在里面（已实测）。
     * 它随应用安装产生，应用被删后会留下，因此作为残留候选。
     * 不要扩到父目录 `~/Library/Application Support/@deepseek-ai`。
     */
    residualPathsByOs: {
      darwin: ['~/Library/Application Support/@deepseek-ai/dsh-desktop'],
    },
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    userSkillsDir: '~/.config/opencode/skills',
    projectSkillsDir: '.opencode/skills',
    detectPath: '~/.config/opencode',
  },
  {
    // Pi uses an active-agent directory at user scope, but discovers project
    // skills directly below .pi (without the agent segment).
    id: 'pi',
    displayName: 'Pi',
    userSkillsDir: '~/.pi/agent/skills',
    projectSkillsDir: '.pi/skills',
    detectPath: '~/.pi/agent',
  },
  {
    // oh-my-pi follows the same asymmetric convention under its own home.
    id: 'omp',
    displayName: 'OMP Agent',
    userSkillsDir: '~/.omp/agent/skills',
    projectSkillsDir: '.omp/skills',
    detectPath: '~/.omp/agent',
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    // .github/skills is the path recognized across CLI, agent mode and
    // code review; VS Code additionally reads .agents/.claude skills.
    userSkillsDir: '~/.copilot/skills',
    projectSkillsDir: '.github/skills',
    detectPath: '~/.copilot',
  },
  {
    id: 'gemini-cli',
    displayName: 'Gemini CLI',
    userSkillsDir: '~/.gemini/skills',
    projectSkillsDir: '.gemini/skills',
    detectPath: '~/.gemini',
  },
  {
    id: 'google-antigravity',
    displayName: 'Google Antigravity',
    userSkillsDir: '~/.gemini/config/skills',
    projectSkillsDir: '.agents/skills',
    detectPath: '~/.gemini/config',
    /**
     * 真机验证（官方 dmg 内 Info.plist）：CFBundleName `Antigravity`、
     * CFBundleIdentifier `com.google.antigravity`、2.12.2；dmg 里只有
     * `Antigravity.app` 和指向 `/Applications` 的软链，故本体就是这两个落点。
     * 声明后即可区分「应用已删除、只剩数据目录」。
     */
    installPathsByOs: {
      darwin: ['/Applications/Antigravity.app', '~/Applications/Antigravity.app'],
    },
    macBundleId: 'com.google.antigravity',
    /**
     * v2 起 AppDataDir 迁到 `~/.gemini/config`（即 detectPath 本身），v1 留下的
     * 同级目录仍归它所有。**不要**加 `~/.gemini`：那是 Gemini CLI 的 detectPath，
     * Gemini CLI 0.59.0 只引用 `.gemini/settings.json` 与 `.gemini/skills`，
     * 与 `.gemini/config` 无交集，清理列表必须停在 Antigravity 自己的子目录。
     */
    residualPathsByOs: {
      darwin: ['~/.gemini/antigravity', '~/.gemini/antigravity-backup', '~/.gemini/antigravity-ide'],
    },
  },
  {
    id: 'qwen-code',
    displayName: 'Qwen Code',
    userSkillsDir: '~/.qwen/skills',
    projectSkillsDir: '.qwen/skills',
    detectPath: '~/.qwen',
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    userSkillsDir: '~/.codebuddy/skills',
    projectSkillsDir: '.codebuddy/skills',
    detectPath: '~/.codebuddy',
  },
  {
    id: 'trae',
    displayName: 'Trae',
    userSkillsDir: '~/.trae/skills',
    projectSkillsDir: '.trae/skills',
    detectPath: '~/.trae',
    // 证据：Trae 自己的日志里出现 `/Applications/Trae.app/Contents/MacOS/Electron`
    // 且带 `__CFBundleIdentifier=com.trae.app`。
    installPathsByOs: {
      darwin: ['/Applications/Trae.app', '~/Applications/Trae.app'],
    },
    macBundleId: 'com.trae.app',
  },
  {
    // The China edition keeps a separate home dir from international Trae.
    id: 'trae-cn',
    displayName: 'Trae CN',
    userSkillsDir: '~/.trae-cn/skills',
    projectSkillsDir: '.trae/skills',
    detectPath: '~/.trae-cn',
  },
  {
    id: 'workbuddy',
    displayName: 'WorkBuddy',
    // Desktop assistant — no per-project scope. Deliberately the
    // 使用官方教程约定的路径，不采用第三方市场缓存目录
    // subdir (their issue #343). Pending real-machine verification.
    userSkillsDir: '~/.workbuddy/skills',
    projectSkillsDir: null,
    detectPath: '~/.workbuddy',
  },
  {
    id: 'doubao',
    displayName: '豆包',
    /** The desktop app creates this user-visible directory for imported skills. */
    userSkillsDir: '~/Doubao/skills',
    projectSkillsDir: null,
    detectPath: '~/Doubao',
    // 证据：豆包桌面版自己的数据目录里出现 `/Applications/Doubao.app/Contents/Helpers/
    // Doubao Browser.app/...`（桌面版内嵌浏览器，v2.21.10）。注意这与独立安装的
    // 「豆包浏览器.app」是两个应用，bundle id 分别为 `com.bot.pc.doubao` 与
    // `com.bot.pc.doubao.browser`，不能拿后者的存在与否判断桌面版。
    installPathsByOs: {
      darwin: ['/Applications/Doubao.app', '~/Applications/Doubao.app'],
    },
    macBundleId: 'com.bot.pc.doubao',
  },
  {
    id: 'kimi',
    displayName: 'Kimi Code',
    userSkillsDir: '~/.kimi/skills',
    projectSkillsDir: '.kimi/skills',
    detectPath: '~/.kimi',
  },
  {
    id: 'zcode',
    displayName: 'ZCode',
    userSkillsDir: '~/.zcode/skills',
    projectSkillsDir: '.zcode/skills',
    detectPath: '~/.zcode',
  },
  {
    id: 'wps-lingxi',
    displayName: 'WPS 灵犀',
    // Electron desktop assistant: skills live under app.getPath('userData'),
    // so the location is OS-specific. The macOS row is verified on a real
    // machine (1.2.36 / sandbox 3.23.0); the Windows and Linux rows follow
    // Electron's userData convention and await real-machine verification.
    // Bundled `official_skills` is a read-only sibling resolved by the scanner.
    userSkillsDir: '~/Library/Application Support/WPS 灵犀/serverdir/user_skills',
    userSkillsDirByOs: {
      win32: '~/AppData/Roaming/WPS 灵犀/serverdir/user_skills',
      linux: '~/.config/WPS 灵犀/serverdir/user_skills',
    },
    // Desktop assistant — no per-project scope.
    projectSkillsDir: null,
    detectPath: '~/Library/Application Support/WPS 灵犀',
    detectPathByOs: {
      win32: '~/AppData/Roaming/WPS 灵犀',
      linux: '~/.config/WPS 灵犀',
    },
    // 证据：灵犀自己的云日志（cloudlog-pending-logs.json）里出现
    // `/Applications/WPS 灵犀.app/...` 的 Node 堆栈；bundle id 为 `com.wps.lingxi`。
    // Windows / Linux 的包体位置没有核实过，故只声明 macOS。
    installPathsByOs: {
      darwin: ['/Applications/WPS 灵犀.app', '~/Applications/WPS 灵犀.app'],
    },
    macBundleId: 'com.wps.lingxi',
  },
]
