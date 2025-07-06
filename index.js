import React from 'react';
import ReactDOM from 'react-dom/client'; // Import from react-dom/client for React 18+
import App from './App.js'; // Import your App component

// Get the root element from index.html
const container = document.getElementById('root');

// Create a root for React 18+
const root = ReactDOM.createRoot(container);

// Render your App component into the root
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
