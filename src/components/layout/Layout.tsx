import { ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useResponsiveStyles } from '../../hooks/useResponsiveStyles';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isMobile } = useResponsiveStyles();

  return (
    <div style={styles.root}>
      <Header />
      {!isMobile && <Sidebar />}
      <main style={{ ...styles.main, marginLeft: isMobile ? 0 : '60px' }}>
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
