import wordpress from '@wordpress/eslint-plugin';

export default [
	{
		ignores: [ 'build/**' ],
	},
	...wordpress.configs.recommended,
	{
		languageOptions: {
			globals: {
				IntersectionObserver: 'readonly',
				MutationObserver: 'readonly',
			},
		},
		rules: {
			'prettier/prettier': 'off',
			curly: 'off',
			'import/no-unresolved': 'off',
			'import/no-extraneous-dependencies': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/check-line-alignment': 'off',
			'no-nested-ternary': 'off',
			'no-unused-vars': 'off',
			'no-console': 'off',
			'@wordpress/i18n-ellipsis': 'off',
			'@wordpress/i18n-hyphenated-range': 'off',
			'@wordpress/no-unused-vars-before-return': 'off',
		},
	},
];
