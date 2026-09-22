import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import { JevSettingsSection, type Settings } from './JevSettingsSection.tsx'

export const inject = ['slots', 'settingsScope', 'remote', 'remote.session']

export function apply(ctx: ClientContext): void {
  // The default decoder validates the Host namespace's serialized schema.
  const scope = ctx.settingsScope.bind<Settings>({ namespace: 'jev-context-gate' })
  const loadCatalog = async (): Promise<ModelCatalog> => {
    const response = await ctx.remote.session.modelCatalog()
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
    return response.value
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'jev-context-gate',
    order: 27,
    label: () => 'Jev',
    inject: () => ({ scope, loadCatalog }),
  }, JevSettingsSection))
}
