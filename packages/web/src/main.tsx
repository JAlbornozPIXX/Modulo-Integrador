import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import './assets/index.css';
import router from './Aplication';

const start = async () => {
    const root = document.getElementById('root');
    if(root === null) return;

    createRoot(root).render(
        <StrictMode>
            <RouterProvider router={router} />
        </StrictMode>
    );
};

void start();