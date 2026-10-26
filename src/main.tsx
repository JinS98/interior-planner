import React from 'react';
import ReactDOM from 'react-dom/client';
import { CloudWorkspace } from './pages/CloudWorkspace';
import './styles/global.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CloudWorkspace />
  </React.StrictMode>,
);
