/** Prompt assembly and output parsing for AI-drafted skills. */

export interface SkillDraft {
  name: string
  description: string
  tags: string[]
  content: string
}

export interface ExistingSkillRef {
  name: string
  description: string
}

/**
 * Compose the generation prompt: user intent + cross-platform inventory
 * (dedupe context SkillBuddy uniquely has) + quality meta-spec.
 */
export function buildSkillPrompt(intent: string, existing: ExistingSkillRef[]): string {
  const inventory = existing
    .slice(0, 200)
    .map((s) => `- ${s.name}: ${s.description.slice(0, 120)}`)
    .join('\n')

  return `You are an expert at writing skills (SKILL.md files) for AI coding agents such as Claude Code, Codex and Cursor. A skill is procedural knowledge injected into the agent's context when relevant.

Write ONE skill from the user's intent below.

Quality rules (follow strictly):
- "name": kebab-case, specific, 2-5 words.
- "description": 1-3 sentences stating what the skill does AND when it should trigger, including concrete trigger phrases a user might say. This field decides whether the skill activates, so make it precise, not promotional.
- "content": the SKILL.md body WITHOUT any YAML frontmatter. Dense and imperative; every line must change the agent's behavior — no filler, no pleasantries, no generic advice the model already knows. Prefer short sections like "When to use", "Steps", "Rules", "Pitfalls". Aim for under 80 lines.
- Write "description" and "content" in the same language as the user's intent.
- "tags": 1-4 short lowercase topical tags.

Existing skills on this machine (avoid duplicating them; if the intent clearly overlaps one, reuse its EXACT name so the result becomes an update of it):
${inventory || '(none)'}

Output STRICT JSON only — a single JSON object, no markdown fences, no commentary:
{"name":"...","description":"...","tags":["..."],"content":"..."}

User intent:
${intent}`
}

/** Extract the draft JSON from raw model output (tolerates fences and prose around it). */
export function parseSkillDraft(text: string): SkillDraft {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object in output')
  const raw = JSON.parse(text.slice(start, end + 1)) as Partial<SkillDraft>
  if (typeof raw.name !== 'string' || typeof raw.content !== 'string' || !raw.content.trim()) {
    throw new Error('draft is missing name/content')
  }
  return {
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
    content: raw.content,
  }
}
