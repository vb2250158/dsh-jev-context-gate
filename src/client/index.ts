import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-remotes/client'
import { JevSettingsSection, type Settings } from './JevSettingsSection.tsx'
import { createSettingsForm } from './settings-form.mjs'

export const inject = ['slots', 'configForms', 'remote', 'remote.session']

export function apply(ctx: ClientContext): void {
  // Rule migration callbacks are executable code and cannot cross the JSON settings transport.
  const scope = createSettingsForm(ctx.configForms.get<Settings>('dsh-jev-context-gate'), ctx.configForms.describe())
  const loadCatalog = async (): Promise<ModelCatalog> => {
    const response = await ctx.remote.session.modelCatalog()
    if (!response.ok) throw new Error(`${response.error.code}: ${response.error.message}`)
    return response.value
  }
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config',
    key: 'dsh-jev-context-gate',
    inject: () => ({ scope, loadCatalog }),
  }, JevSettingsSection))
}
