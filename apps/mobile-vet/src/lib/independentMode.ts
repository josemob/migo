import { createContext, useContext } from 'react';

// Permite que el vet INDEPENDIENTE, estando dentro del panel principal (MainApp),
// vuelva a su panel independiente. Es null para el staff de clínica normal.
export const IndependentBackContext = createContext<null | (() => void)>(null);
export const useIndependentBack = () => useContext(IndependentBackContext);
