<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { InstalledSkill } from '@skills-manager/core'

const skills = ref<InstalledSkill[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    skills.value = await window.skillsManager.scanSkills()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page">
    <h1>Skills Manager</h1>
    <p class="subtitle">本机已安装的 AI agent skills</p>

    <p v-if="loading">扫描中…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="skills.length === 0">未发现已安装的 skills。</p>

    <ul v-else class="skill-list">
      <li v-for="item in skills" :key="item.path" class="skill-card">
        <div class="skill-head">
          <strong>{{ item.skill.name }}</strong>
          <span class="badge">{{ item.agent }}</span>
          <span class="badge scope">{{ item.scope }}</span>
        </div>
        <p class="desc">{{ item.skill.description }}</p>
        <code class="path">{{ item.path }}</code>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.page {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: system-ui, -apple-system, sans-serif;
}
.subtitle {
  color: #666;
}
.error {
  color: #c0392b;
}
.skill-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skill-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 14px 16px;
}
.skill-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
}
.badge.scope {
  background: #f0fdf4;
  color: #15803d;
}
.desc {
  margin: 8px 0 6px;
  color: #444;
}
.path {
  font-size: 12px;
  color: #999;
  word-break: break-all;
}
</style>
