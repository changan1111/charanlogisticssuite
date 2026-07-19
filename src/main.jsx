import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';

// fleet/styles/app.css is fully scoped under #fleet-root and re-themed to
// the invoice palette; invoice/styles/global.css provides the base theme;
// shell.css (banner + white sidebar layout) loads last so it always wins.
import './fleet/styles/app.css';
import './invoice/styles/global.css';
import './styles/shell.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
