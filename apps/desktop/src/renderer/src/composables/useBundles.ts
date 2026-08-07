import { ref } from 'vue'
import {
  BUILT_IN_BUNDLES,
  parseBundlesManifest,
  REMOTE_BUNDLES_MANIFEST_URL,
  type SkillBundle,
} from '@/lib/bundles'

const bundles = ref<SkillBundle[]>(BUILT_IN_BUNDLES)
let loadPromise: Promise<void> | null = null

/** Fetch the remote manifest once per session; offline/bad payload keeps built-ins. */
function ensureLoaded(): Promise<void> {
  if (!REMOTE_BUNDLES_MANIFEST_URL) return Promise.resolve()
  loadPromise ??= (async () => {
    try {
      const raw = await window.skillsManager.fetchBundlesManifest(REMOTE_BUNDLES_MANIFEST_URL)
      const parsed = parseBundlesManifest(raw)
      if (parsed.length > 0) bundles.value = parsed
    } catch {
      // keep built-ins
    }
  })()
  return loadPromise
}

export function useBundles() {
  return { bundles, ensureLoaded }
}
