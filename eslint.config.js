import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: {
                ...globals.browser,
                ...globals.worker,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.flat.recommended.rules,
            'no-undef': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['api/**/*.ts', '*.{js,ts}'],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: globals.node,
        },
        rules: {
            'no-undef': 'off',
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['../src/**', '../../src/**', '../../../src/**'],
                    message: '서버 코드는 src에 의존할 수 없습니다. 공유 로직은 domains의 공개 API로 이동하세요.',
                }],
            }],
        },
    },
);
