'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useSession } from 'next-auth/react';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';
import Link from 'next/link';

export default function Home() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync language state with i18n after mount to avoid hydration mismatch
  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => {
      setCurrentLanguage(lng);
    };
    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  // Prevent hydration mismatch - don't render until mounted
  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 dark:from-black dark:via-gray-950 dark:to-black transition-colors">
      <header className="border-b border-gray-200 dark:border-gray-900 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-violet-600 dark:from-blue-500 dark:to-violet-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                {t('header.logo')}
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-6">
              <a href="#how-it-works" className="text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                {t('header.howItWorks')}
              </a>
              <a href="#benefits" className="text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                {t('header.benefits')}
              </a>
              
              {/* Language Toggle */}
              <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-6">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
                  }`}
                >
                  ΕΛ
                </button>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-lg text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </button>

              {session ? (
                <ProfileDropdown />
              ) : (
                <Link href="/login" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium shadow-md hover:shadow-lg">
                  {t('header.signIn')}
                </Link>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-3 lg:hidden">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

        {/* Mobile Side Drawer - Outside header for proper z-index */}
        <>
          {/* Backdrop with animation */}
          <div
            className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998] lg:hidden transition-opacity duration-300 ${
              mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Side Drawer with improved design */}
          <div
            className={`fixed top-0 right-0 h-full w-[320px] max-w-[85vw] bg-white dark:bg-gray-950 shadow-2xl z-[9999] lg:hidden transform transition-all duration-300 ease-out border-l border-gray-200 dark:border-gray-800 ${
              mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex flex-col h-full">
              {/* Drawer Header with gradient */}
              <div className="relative px-6 pt-6 pb-5 border-b border-gray-200 dark:border-gray-800">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-violet-600/5 dark:from-blue-500/5 dark:to-violet-500/5"></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-violet-600 dark:from-blue-500 dark:to-violet-500 rounded-xl flex items-center justify-center shadow-lg">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <span className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                      {t('header.logo')}
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all"
                    aria-label="Close menu"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto">
                {/* User Profile Section (if logged in) */}
                {session && (
                  <div className="p-4 mx-4 mt-4 bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 rounded-2xl border border-blue-200/50 dark:border-blue-800/50">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                        {session.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{session.user?.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{session.user?.email}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Links */}
                <nav className="px-4 mt-6 space-y-1">
                  <p className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('header.navigation')}
                  </p>
                  <a
                    href="#how-it-works"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all font-medium group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <span>{t('header.howItWorks')}</span>
                  </a>
                  <a
                    href="#benefits"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all font-medium group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/50 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span>{t('header.benefits')}</span>
                  </a>
                </nav>

                {/* Settings Section */}
                <div className="px-4 mt-6 space-y-4">
                  <p className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('dashboard.preferences.title')}
                  </p>

                  {/* Language Toggle */}
                  <div className="px-3">
                    <div className="flex items-center gap-2 p-1.5 bg-gray-100 dark:bg-gray-900 rounded-xl">
                      <button
                        onClick={() => changeLanguage('en')}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          currentLanguage === 'en' || currentLanguage.startsWith('en')
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        English
                      </button>
                      <button
                        onClick={() => changeLanguage('el')}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          currentLanguage === 'el' || currentLanguage.startsWith('el')
                            ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        Ελληνικά
                      </button>
                    </div>
                  </div>

                  {/* Theme Toggle */}
                  <div className="px-3">
                    <button
                      onClick={toggleTheme}
                      className="w-full flex items-center justify-between px-3 py-3 bg-gray-100 dark:bg-gray-900 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                          {theme === 'light' ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          )}
                        </div>
                        <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">
                          {theme === 'light' ? t('dashboard.preferences.darkMode') : t('dashboard.preferences.lightMode')}
                        </span>
                      </div>
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer CTA */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                {session ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white text-center rounded-xl transition-all font-semibold shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    {t('dashboard.menu.overview')}
                  </Link>
                ) : (
                  <div className="space-y-2">
                    <Link
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white text-center rounded-xl transition-all font-semibold shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {t('hero.getStarted')}
                    </Link>
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full px-4 py-3 text-gray-700 dark:text-gray-200 text-center rounded-xl border-2 border-gray-200 dark:border-gray-800 hover:border-blue-600 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all font-medium"
                    >
                      {t('header.signIn')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>

      <main>
        {/* Hero Section */}
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 md:py-32 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-br from-blue-400/20 to-violet-400/20 dark:from-blue-500/10 dark:to-violet-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-tr from-pink-400/20 to-yellow-400/20 dark:from-pink-500/10 dark:to-yellow-500/10 rounded-full blur-3xl"></div>
          
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-full mb-6 sm:mb-8 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-300"></span>
              </span>
              {t('hero.badge')}
            </div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent leading-tight mb-6">
              {t('hero.title')}
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 sm:mb-12 leading-relaxed max-w-3xl mx-auto px-4">
              {t('hero.description')}
            </p>
            
            {!session && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
                >
                  {t('hero.getStarted')}
                  <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium rounded-xl border-2 border-gray-200 dark:border-gray-800 hover:border-blue-600 dark:hover:border-blue-500 transition-all shadow-md hover:shadow-lg"
                >
                  {t('hero.signIn')}
                </Link>
              </div>
            )}
            
            <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto px-4">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent mb-1">24/7</div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('hero.stats.automated')}</div>
              </div>
              <div className="text-center border-x border-gray-200 dark:border-gray-800">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent mb-1">10hrs+</div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('hero.stats.saved')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent mb-1">100%</div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{t('hero.stats.control')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {t('howItWorks.title')}
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {/* Step 1 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-300"></div>
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all border border-gray-100 dark:border-gray-800">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <span className="text-2xl font-bold text-white">1</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('howItWorks.step1.title')}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                  {t('howItWorks.step1.description')}
                </p>
                <div className="flex items-center text-sm text-blue-600 dark:text-blue-400 font-medium">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('howItWorks.step1.time')}
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-300"></div>
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all border border-gray-100 dark:border-gray-800">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <span className="text-2xl font-bold text-white">2</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('howItWorks.step2.title')}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                  {t('howItWorks.step2.description')}
                </p>
                <div className="flex items-center text-sm text-blue-600 dark:text-blue-400 font-medium">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('howItWorks.step2.time')}
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-violet-600 rounded-2xl opacity-0 group-hover:opacity-20 blur transition duration-300"></div>
              <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all border border-gray-100 dark:border-gray-800">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl flex items-center justify-center mb-6 shadow-lg">
                  <span className="text-2xl font-bold text-white">3</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('howItWorks.step3.title')}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                  {t('howItWorks.step3.description')}
                </p>
                <div className="flex items-center text-sm text-green-600 dark:text-green-400 font-medium">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('howItWorks.step3.time')}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section id="benefits" className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-black">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {t('benefits.title')}
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('benefits.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-10">
            {/* Save Time */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100 dark:border-gray-800 group">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {t('benefits.saveTime.title')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                {t('benefits.saveTime.description')}
              </p>
              <div className="inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-300 text-sm font-semibold">
                {t('benefits.saveTime.metric')}
              </div>
            </div>

            {/* Protect Brand */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100 dark:border-gray-800 group">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {t('benefits.protectBrand.title')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                {t('benefits.protectBrand.description')}
              </p>
              <div className="inline-flex items-center px-4 py-2 bg-violet-50 dark:bg-violet-900/30 rounded-lg text-violet-700 dark:text-violet-300 text-sm font-semibold">
                {t('benefits.protectBrand.metric')}
              </div>
            </div>

            {/* Fast Replies */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all border border-gray-100 dark:border-gray-800 group">
              <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                {t('benefits.fastReplies.title')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                {t('benefits.fastReplies.description')}
              </p>
              <div className="inline-flex items-center px-4 py-2 bg-pink-50 dark:bg-pink-900/30 rounded-lg text-pink-700 dark:text-pink-300 text-sm font-semibold">
                {t('benefits.fastReplies.metric')}
              </div>
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {t('trust.title')}
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              {t('trust.subtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {/* Secure & Private */}
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-md hover:shadow-lg transition-all border border-gray-100 dark:border-gray-800 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t('trust.secure.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {t('trust.secure.description')}
              </p>
            </div>

            {/* Full Control */}
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-md hover:shadow-lg transition-all border border-gray-100 dark:border-gray-800 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t('trust.control.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {t('trust.control.description')}
              </p>
            </div>

            {/* Custom Rules */}
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-md hover:shadow-lg transition-all border border-gray-100 dark:border-gray-800 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t('trust.customRules.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {t('trust.customRules.description')}
              </p>
            </div>

            {/* Full Transparency */}
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-md hover:shadow-lg transition-all border border-gray-100 dark:border-gray-800 text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {t('trust.transparency.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {t('trust.transparency.description')}
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32">
          <div className="relative bg-gradient-to-br from-blue-600 via-violet-600 to-purple-700 rounded-3xl p-8 sm:p-12 md:p-16 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            
            <div className="relative text-center max-w-3xl mx-auto">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
                {t('cta.title')}
              </h2>
              <p className="text-lg sm:text-xl text-blue-100 mb-8 sm:mb-12">
                {t('cta.subtitle')}
              </p>
              
              {!session && (
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-blue-600 font-bold rounded-xl transition-all shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 hover:scale-105 mb-8"
                >
                  {t('cta.button')}
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              )}
              
              <p className="text-sm text-blue-100 mb-6">
                {t('cta.note')}
              </p>
              
              {/* Trust badges */}
              <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-sm font-medium">{t('cta.badges.gdpr')}</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium">{t('cta.badges.encryption')}</span>
                </div>
                <div className="flex items-center gap-2 text-white/90">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">{t('cta.badges.uptime')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-900 bg-white dark:bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-gray-600 dark:text-gray-400 text-sm">
              {t('footer.copyright')}
            </div>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm font-medium">
                {t('footer.privacy')}
              </a>
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm font-medium">
                {t('footer.terms')}
              </a>
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm font-medium">
                {t('footer.contact')}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
