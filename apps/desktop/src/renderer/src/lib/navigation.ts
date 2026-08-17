export type AppView =
  | 'dashboard'
  | 'skills'
  | 'groups'
  | 'mcp'
  | 'team'
  | 'settings'

export type WorkspaceView = Exclude<AppView, 'settings'>

export type SettingsCategory =
  | 'general'
  | 'appearance'
  | 'behavior'
  | 'team-library'
  | 'platforms'
  | 'network'
  | 'projects'
  | 'data'
  | 'about'

/** 从待处理项打开 skill 时需要定位的详情区块。 */
export type SkillFocus = 'drift' | 'install'
