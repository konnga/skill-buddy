import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PLATFORMS,
  resolvePlatformOsList,
  resolvePlatformOsPath,
  type PlatformDef,
  type PlatformOs,
} from './platforms.js'
import { containsPath, expandResiduePath } from './platform-residue.js'

/** 假主目录：这一组断言只做字符串路径比较，不访问磁盘。 */
const HOME = '/Users/demo'
const OSES: PlatformOs[] = ['darwin', 'win32', 'linux']

/**
 * 清理候选 = `detectPath` 加上平台自己声明的残留目录。判定与清理都从这份声明
 * 推导，所以「声明本身是否安全」必须由测试兜住。
 */
function cleanupCandidates(def: PlatformDef, os: PlatformOs): string[] {
  return [
    resolvePlatformOsPath(def.detectPath, def.detectPathByOs, os),
    ...resolvePlatformOsList(def.residualPathsByOs, os),
  ].map((path) => expandResiduePath(path, HOME))
}

describe('BUILTIN_PLATFORMS', () => {
  it('registers Google Antigravity with its native Skills roots', () => {
    expect(BUILTIN_PLATFORMS).toContainEqual({
      id: 'google-antigravity',
      displayName: 'Google Antigravity',
      userSkillsDir: '~/.gemini/config/skills',
      projectSkillsDir: '.agents/skills',
      detectPath: '~/.gemini/config',
      // 本体路径真机核实自官方 dmg 内 Info.plist（CFBundleName `Antigravity`）。
      installPathsByOs: {
        darwin: ['/Applications/Antigravity.app', '~/Applications/Antigravity.app'],
      },
      macBundleId: 'com.google.antigravity',
      // 只声明 Antigravity 自己名下的目录；`~/.gemini` 属于 Gemini CLI，不能碰。
      residualPathsByOs: {
        darwin: [
          '~/.gemini/antigravity',
          '~/.gemini/antigravity-backup',
          '~/.gemini/antigravity-ide',
        ],
      },
    })
  })
  it('registers Qwen Code with personal and project Skills roots', () => {
    expect(BUILTIN_PLATFORMS).toContainEqual({
      id: 'qwen-code',
      displayName: 'Qwen Code',
      userSkillsDir: '~/.qwen/skills',
      projectSkillsDir: '.qwen/skills',
      detectPath: '~/.qwen',
    })
  })

  it('registers DeepSeek Harness with personal and project Skills roots', () => {
    expect(BUILTIN_PLATFORMS).toContainEqual({
      id: 'deepseek-harness',
      displayName: 'DeepSeek Harness',
      userSkillsDir: '~/.dsh/skills',
      projectSkillsDir: '.dsh/skills',
      detectPath: '~/.dsh',
      installPathsByOs: {
        darwin: ['/Applications/DeepSeek Harness.app', '~/Applications/DeepSeek Harness.app'],
      },
      macBundleId: 'com.deepseek.dsh',
      residualPathsByOs: {
        darwin: ['~/Library/Application Support/@deepseek-ai/dsh-desktop'],
      },
    })
  })

  /**
   * 平台 id 是各处按 id 查找的键（adapter 工厂、图标、设置页列表行 key）。
   * 重复的 id 会让同一个平台在列表里出现两次、并让 `find` 只命中前一条 ——
   * 给已存在的平台挪位置（重排数组）时最容易留下这种重复，所以在表这一层兜住。
   */
  it('keeps platform ids unique', () => {
    const ids = BUILTIN_PLATFORMS.map((platform) => platform.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['pi', 'Pi', '~/.pi/agent/skills', '.pi/skills', '~/.pi/agent'],
    ['omp', 'OMP Agent', '~/.omp/agent/skills', '.omp/skills', '~/.omp/agent'],
  ] as const)(
    'registers %s with asymmetric personal and project Skills roots',
    (id, displayName, userSkillsDir, projectSkillsDir, detectPath) => {
      expect(BUILTIN_PLATFORMS).toContainEqual({
        id,
        displayName,
        userSkillsDir,
        projectSkillsDir,
        detectPath,
      })
    },
  )

  it.each([
    ['cursor', 'Cursor', '/Applications/Cursor.app'],
    ['trae', 'Trae', '/Applications/Trae.app'],
    ['doubao', '豆包', '/Applications/Doubao.app'],
    ['wps-lingxi', 'WPS 灵犀', '/Applications/WPS 灵犀.app'],
  ] as const)('declares the verified macOS bundle of %s', (id, displayName, appPath) => {
    const def = BUILTIN_PLATFORMS.find((platform) => platform.id === id)

    expect(def?.displayName).toBe(displayName)
    expect(def?.macBundleId).toMatch(/^[a-zA-Z0-9.-]+$/)
    expect(resolvePlatformOsList(def?.installPathsByOs, 'darwin')).toContain(appPath)
    // 只声明 macOS：其它系统留空表示该平台在那里不参与判定，而不是「本体不存在」。
    expect(resolvePlatformOsList(def?.installPathsByOs, 'win32')).toEqual([])
    expect(resolvePlatformOsList(def?.installPathsByOs, 'linux')).toEqual([])
  })
})

describe('BUILTIN_PLATFORMS 残留声明的纪律', () => {
  /**
   * 只有声明了本体路径的平台才会产生清理候选，所以纪律只需约束它们：没声明的
   * 平台（CLI 类）永远不会拿到删除入口，它的根目录再宽也不构成风险。
   */
  const participants = BUILTIN_PLATFORMS.filter(
    (def) => OSES.some((os) => resolvePlatformOsList(def.installPathsByOs, os).length > 0) === true,
  )

  /**
   * 声明纪律是清理功能的第一道防线：候选目录只能落在平台自己名下，绝不能等于
   * 或覆盖别的平台的根目录。写成测试是因为这一条一旦写错，后果不可逆 ——
   * 例如把 Gemini CLI 的 `~/.gemini` 写进 Antigravity 的残留列表。
   */
  it.each(OSES)('候选不覆盖任何其它平台的根目录（%s）', (os) => {
    const violations: string[] = []

    for (const def of participants) {
      const foreignRoots = BUILTIN_PLATFORMS.filter((other) => other.id !== def.id).map((other) =>
        expandResiduePath(resolvePlatformOsPath(other.detectPath, other.detectPathByOs, os), HOME),
      )
      for (const candidate of cleanupCandidates(def, os)) {
        for (const root of foreignRoots) {
          if (containsPath(candidate, root)) {
            violations.push(`${def.id} 的候选 ${candidate} 覆盖了其它平台根目录 ${root}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  it.each(OSES)('候选不得是主目录或文件系统根（%s）', (os) => {
    const violations: string[] = []

    for (const def of participants) {
      for (const candidate of cleanupCandidates(def, os)) {
        // 等于 HOME 也不算「位于 HOME 之下」，所以相等与覆盖要分别拒绝。
        if (candidate === HOME || candidate === '/' || containsPath(candidate, HOME)) {
          violations.push(`${def.id} 的候选 ${candidate} 覆盖到了主目录`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('本体路径必须是绝对路径或 ~/ 前缀', () => {
    const violations: string[] = []

    for (const def of BUILTIN_PLATFORMS) {
      for (const os of OSES) {
        for (const path of resolvePlatformOsList(def.installPathsByOs, os)) {
          if (!path.startsWith('/') && !path.startsWith('~/')) {
            violations.push(`${def.id} 的安装路径不是绝对路径：${path}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  /**
   * Gemini CLI 的 `~/.gemini` 与 Antigravity 的 `~/.gemini/config` 是嵌套关系，
   * 且方向的危险性只在一侧：`~/.gemini` 会盖住 `~/.gemini/config`，反之则安全。
   *
   * 之所以现在没问题，是因为 Gemini CLI 是 CLI 平台、不声明本体路径，永远拿不到
   * 删除入口。一旦它将来声明了包体，`filterProtectedCandidates` 就是最后一道
   * 防线 —— 它会在 Antigravity 处于已检测状态时把 `~/.gemini` 从候选里剔除。
   */
  it('记录 Gemini CLI 与 Antigravity 的嵌套方向', () => {
    const home = HOME
    const geminiCli = BUILTIN_PLATFORMS.find((def) => def.id === 'gemini-cli')
    const antigravity = BUILTIN_PLATFORMS.find((def) => def.id === 'google-antigravity')
    const geminiRoot = expandResiduePath(
      resolvePlatformOsPath(geminiCli!.detectPath, geminiCli!.detectPathByOs, 'darwin'),
      home,
    )
    const antigravityRoot = expandResiduePath(
      resolvePlatformOsPath(antigravity!.detectPath, antigravity!.detectPathByOs, 'darwin'),
      home,
    )

    expect(containsPath(geminiRoot, antigravityRoot)).toBe(true)
    expect(containsPath(antigravityRoot, geminiRoot)).toBe(false)
    expect(resolvePlatformOsList(geminiCli?.installPathsByOs, 'darwin')).toEqual([])
  })
})
