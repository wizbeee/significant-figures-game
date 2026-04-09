import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './renderer/App';
import { PresentationProvider } from './renderer/PresentationContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <PresentationProvider>
    <App />
  </PresentationProvider>
);
