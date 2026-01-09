import Conf from 'conf';

export interface ConfigSchema {
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    modelName: string;
}

const config = new Conf<ConfigSchema>({
    projectName: 'cadre',
    defaults: {
        modelName: 'gpt-3.5-turbo', // Default backup
        openaiBaseUrl: 'http://localhost:8000/v1' // Default vLLM
    }
});

export const getConfig = (): ConfigSchema => {
    return {
        openaiApiKey: config.get('openaiApiKey'),
        openaiBaseUrl: config.get('openaiBaseUrl'),
        modelName: config.get('modelName')
    };
};

export const setConfig = (key: keyof ConfigSchema, value: string) => {
    config.set(key, value);
};

export const clearConfig = () => {
    config.clear();
};
