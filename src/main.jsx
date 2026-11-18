import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { UiProvider } from './ui.jsx';
import '@fontsource-variable/archivo/wdth.css';
import './styles.css';
import { applyTheme } from './theme.js';
import { registerSw } from './push.js';
import { watchKeyboard } from './keyboard.js';

applyTheme();
registerSw();
watchKeyboard();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <UiProvider>
        <App />
      </UiProvider>
    </BrowserRouter>
  </StrictMode>,
);
