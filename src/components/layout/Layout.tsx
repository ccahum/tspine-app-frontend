import { useState } from 'react';
import type { ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isMobile } = useResponsiveStyles();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div style={styles.root}>
      <Header onMenuClick={() => setMobileNavOpen(true)} />
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <main className="page-fade-in" style={{ ...styles.main, marginLeft: isMobile ? 0 : '60px' }}>
        {children}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#f4f5f7',
    position: 'relative',
  },
  main: {
    marginTop: '60px',
    marginLeft: '60px',
    padding: '1rem 0',
    minHeight: 'calc(100vh - 60px)',
  },
};
