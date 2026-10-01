import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SegmentedControl } from './Form';

/** Selector de tema claro/oscuro, con íconos para reconocerlo de un vistazo. */
export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedControl
      ariaLabel="Tema de la interfaz"
      size="sm"
      value={theme}
      onChange={(next) => setTheme(next)}
      options={[
        { value: 'light', label: '', ariaLabel: 'Tema claro', icon: <Sun className="h-3.5 w-3.5" /> },
        { value: 'dark', label: '', ariaLabel: 'Tema oscuro', icon: <Moon className="h-3.5 w-3.5" /> },
      ]}
    />
  );
};
