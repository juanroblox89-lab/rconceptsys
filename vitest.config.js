import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        restoreMocks: true,
        coverage: {
            provider: 'v8',
            include: [
                'api/**/*.js',
                'components/**/*.js',
                'js/**/*.js',
                'pages/**/*.js',
                'services/**/*.js',
                'supabase/**/*.js',
                'utils/**/*.js'
            ],
            reporter: ['text', 'json-summary', 'html']
        }
    }
});
