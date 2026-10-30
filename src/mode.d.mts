export declare function modeForModel(model: string, provider?: string): 'unconfigured' | 'jev-native' | 'llm-json' | 'unsupported'
export declare function isNativeSelection(settings: { provider: string; model: string }): boolean
export declare function unsupportedModelReason(model: string, provider?: string): string | undefined
