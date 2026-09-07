# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

TODO:
* adding + removing moons
* test randomly generated systems
* multi star
* jovian moon main worlds


8wqaf
b29k1h - variation  1
b5ushj
x996lu - melter
tx8izx
tvizni
h8jpmj
kxbh64
iidgeg

claude --resume a404dfe6-6132-4ad9-b386-0c162f2c8f5c << hist
claude --resume 743a3b51-aab0-4458-bd92-dc66828b5a32 << monsoons
codex resume 019f8775-0271-7a70-8d80-a58fe1d0b10b

claude --resume 4bc48604-7335-4e3b-a1c5-87270824c9e0 --dangerously-skip-permissions


claude --resume dd4a09d1-7bb7-413f-b47e-3690724a15bc
2. East Asian trough (small, wind only). South China is the last big monsoon miss. The trough over 105-120E needs to sit at 35-45N in July. Two cheap options: widen the trough smoothing window so Tibet's heat reaches those longitudes, or let the plateau term weight by terrain area within the window rather than per-cell height. About an hour, measurable on the S China row.
3. NH polar band (medium, temperature side). Direction cosine there is 0.08, effectively random, on 15% of land cells. Cause: the EBM's 60-90N temperatures are zonally flat, so no Icelandic low / Siberian high contrast exists for the thermal anomaly to act on. The fix is a winter land-sea contrast at high latitude, which the land/ocean column split now makes possible: land cells already cool more than ocean in winter, so this may partly be a matter of raising the wind's thermal coupling only poleward of the polar front, where the anomaly is real signal rather than noise.
4. Southern westerlies speed (small). 30S-60S is 1.25 m/s slow with good direction. Deepening the polar-front trough by the zonal ocean fraction at that latitude is the physical mechanism and generic across planets. About an hour.
5. Somali jet / orographic channeling (large). Arabia's +2.3 westerly and several other coastal jets need flow steering along mountain barriers, which is a different kind of term than anything in the model. I'd leave this unless you want per-region fidelity beyond the zonal-mean structure.

Why South China stops here. The southerly component now appears, but the easterly persists because the cell template places the summer ridge poleward of the 25N trough, right over South China. Real July flow there is the western flank of the Pacific subtropical high, an ocean feature east of the coast that the zonal template has no longitude structure for. Closing it needs the template to carry a longitude-dependent ridge, which is a structural change rather than a tuning one. I'd put that with the polar-front ocean-fraction item if you want to go further.

2. Add the nonlinear term to the solver. Advection of momentum is what makes boundary jets and closed gyres appear. It's a few extra lines in the iteration but changes the convergence behaviour, so it needs testing.
