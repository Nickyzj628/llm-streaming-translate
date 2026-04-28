// https://www.typescriptlang.org/tsconfig/#noUncheckedSideEffectImports
declare module '*.scss' {
  const content: { [className: string]: string };
  export default content;
}

// Vite environment variables
interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
