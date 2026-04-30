export interface StorageSchema {
  username: string;
  enableLogging: boolean;
  visitCount: number;
  baseUrl: string;
  model: string;
  apiKey: string;
  body: string;
  sourceLang: string;
  targetLang: string;
}

export const defaultStorage: StorageSchema = {
  username: '',
  enableLogging: false,
  visitCount: 0,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: '',
  body: '',
  sourceLang: 'English',
  targetLang: 'Chinese',
};
