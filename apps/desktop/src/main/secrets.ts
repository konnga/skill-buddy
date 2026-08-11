import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * 密钥统一存放在 userData/secrets.json，值经 safeStorage（系统钥匙串后端）
 * 加密后 base64 编码。渲染进程经 secure:get/secure:set 读写；主进程内部
 * （如 GitHub 请求带 Token）直接调用 readSecret。
 */
const secretsPath = (): string => join(app.getPath('userData'), 'secrets.json')

async function readAll(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(secretsPath(), 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

/** 读取并解密一个密钥，不存在或解密失败返回空串。 */
export async function readSecret(key: string): Promise<string> {
  const encrypted = (await readAll())[key]
  if (!encrypted) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return ''
  }
}

/** 写入（空值为删除）一个密钥。 */
export async function writeSecret(key: string, value: string): Promise<void> {
  const secrets = await readAll()
  if (!value) {
    delete secrets[key]
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('secure storage unavailable - cannot encrypt secret / 系统加密后端不可用')
    }
    secrets[key] = safeStorage.encryptString(value).toString('base64')
  }
  await fs.writeFile(secretsPath(), JSON.stringify(secrets), 'utf8')
}
