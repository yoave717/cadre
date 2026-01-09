import OpenAI from 'openai';
import { getConfig } from './config.js';

let clientInstance: OpenAI | null = null;

export const getClient = (): OpenAI => {
    if (clientInstance) return clientInstance;

    const config = getConfig();

    // vLLM often doesn't need a key, but the SDK requires one.
    const apiKey = config.openaiApiKey || 'EMPTY';
    const baseURL = config.openaiBaseUrl || 'http://localhost:8000/v1';

    clientInstance = new OpenAI({
        baseURL,
        apiKey,
    });

    return clientInstance;
};

export const resetClient = () => {
    clientInstance = null;
}
