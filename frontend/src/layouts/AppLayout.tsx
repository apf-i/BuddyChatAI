import { ReactNode } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import './AppLayout.css';

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
  hideFooter?: boolean;
  fullBleed?: boolean;
}

export default function AppLayout({
  children,
  className = '',
  hideFooter = false,
  fullBleed = false,
}: AppLayoutProps) {
  return (
    <div className={`app-layout-page page-bg ${className} ${fullBleed ? 'app-layout-full-bleed' : ''}`}>
      <Header />
      <main className={`app-layout-main ${fullBleed ? 'app-layout-main-bleed' : ''}`}>
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}
