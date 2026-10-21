import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {initKv, requestPersistence} from './services/kvStore';
import {setupPwa} from './pwa';
import './index.css';

/**
 * Los datos se cargan en memoria antes del primer pintado: el resto de la
 * aplicación los lee de forma síncrona. Si el almacenamiento falla, igual se
 * arranca (con el respaldo que corresponda) en lugar de dejar la pantalla vacía.
 */
async function start(): Promise<void> {
  await initKv();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  setupPwa();
  // Pide que el navegador no borre los datos si falta espacio.
  void requestPersistence();
}

void start();
