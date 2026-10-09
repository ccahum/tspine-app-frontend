import { useEffect, useState, useRef } from 'react';

export function useResponsiveStyles() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  // Para layouts con barra lateral: por debajo de este ancho la columna principal queda muy
  // angosta si además se le resta el espacio de la barra, así que esta se apila debajo.
  const [isNarrow, setIsNarrow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handleResize = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsMobile(window.innerWidth < 768);
        setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
        setIsNarrow(window.innerWidth < 1300);
      }, 100);
    };

    const updateSize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
      setIsNarrow(window.innerWidth < 1300);
    };

    updateSize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { isMobile, isTablet, isNarrow };
}
